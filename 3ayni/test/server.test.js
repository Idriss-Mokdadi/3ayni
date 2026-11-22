import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createRelay } from '../server/index.js';

let relay;
let port;

beforeAll(async () => {
  relay = createRelay({ token: 'test-token-123', port: 0 });
  port = await relay.listen();
});

afterAll(() => relay.close());

/** Opens a socket and collects every event it receives. */
function connect(role, token = 'test-token-123') {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?role=${role}&token=${token}`);
  const received = [];
  socket.on('message', (data) => received.push(JSON.parse(data.toString())));
  const opened = new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
  return { socket, received, opened, closed };
}

const waitFor = async (predicate, timeoutMs = 2000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('relay server', () => {
  it('rejects a wrong token', async () => {
    const intruder = connect('caregiver', 'wrong-token-000');
    expect(await intruder.closed).toBe(4401);
  });

  it('serves pairing details to this computer only', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/session`);
    const body = await response.json();
    expect(body.token).toBe('test-token-123');
    expect(body.caregiverUrl).toContain('#test-token-123');
    expect(body.qrSvg).toContain('<svg');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('relays patient messages to caregivers and questions back', async () => {
    const patient = connect('patient');
    const caregiver = connect('caregiver');
    await Promise.all([patient.opened, caregiver.opened]);
    await waitFor(() => caregiver.received.some((e) => e.type === 'history'));

    patient.socket.send(
      JSON.stringify({ type: 'message', ts: 1, payload: { id: 'water', text: 'I want to drink', urgency: 'routine', category: 'needs' } }),
    );
    await waitFor(() => caregiver.received.some((e) => e.type === 'message'));

    caregiver.socket.send(JSON.stringify({ type: 'question', ts: 2, payload: { text: 'Are you cold?' } }));
    await waitFor(() => patient.received.some((e) => e.type === 'question'));

    patient.socket.close();
    caregiver.socket.close();
  });

  it('refuses events a role is not allowed to send', async () => {
    const caregiver = connect('caregiver');
    await caregiver.opened;
    caregiver.socket.send(JSON.stringify({ type: 'alert', ts: 1, payload: { id: 'x', level: 'urgent', reason: 'fake' } }));
    await waitFor(() => caregiver.received.some((e) => e.type === 'error'));
    expect(caregiver.received.find((e) => e.type === 'error').payload.reason).toBe('type');
    caregiver.socket.close();
  });

  it('gives late-joining caregivers the recent history', async () => {
    const late = connect('caregiver');
    await late.opened;
    await waitFor(() => late.received.some((e) => e.type === 'history'));
    const history = late.received.find((e) => e.type === 'history').payload.events;
    expect(history.some((e) => e.type === 'message' && e.payload.id === 'water')).toBe(true);
    late.socket.close();
  });
});
