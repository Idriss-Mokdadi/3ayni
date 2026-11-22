// Relay between the bedside screen and caregiver phones on the same local
// network. It stores nothing on disk and never receives images: only the
// events defined in web/src/shared/protocol.js.
//
//   Bedside screen  --(localhost only)-->  server  --(paired by token)-->  caregiver phones
//
// Security
//   - the bedside role and the pairing token are only available from this
//     computer (loopback), so another device cannot pose as the patient
//   - caregivers need the random token from the QR code shown at the bedside
//   - every frame is size-limited, rate-limited and schema-validated
//   - only the last 100 messages/alerts are kept in memory for late joiners

import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { CAREGIVER_EVENTS, MAX_MESSAGE_BYTES, PATIENT_EVENTS, parseEvent } from '../web/src/shared/protocol.js';

const PORT = Number(process.env.PORT ?? 3000);
const HISTORY_LIMIT = 100;
const RATE_LIMIT_PER_SECOND = 30;
const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

export function createRelay({ token = randomBytes(18).toString('base64url'), port = PORT } = {}) {
  const history = [];
  let lastVitals = null;
  const patients = new Set();
  const caregivers = new Set();

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(self), microphone=()',
    });
    next();
  });

  // Pairing details for the bedside screen. Loopback only.
  app.get('/api/session', async (req, res) => {
    if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: 'bedside only' });
    const caregiverUrl = `http://${lanAddress()}:${server.address().port}/caregiver.html#${token}`;
    res.set('Cache-Control', 'no-store');
    res.json({
      token,
      caregiverUrl,
      qrSvg: await QRCode.toString(caregiverUrl, { type: 'svg', margin: 1, color: { dark: '#0d1117', light: '#ffffff' } }),
    });
  });

  app.use(express.static(distDir, { index: 'index.html' }));

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

  wss.on('connection', (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const role = url.searchParams.get('role');
    const presented = url.searchParams.get('token') ?? '';

    if (!tokensMatch(presented, token) || (role !== 'patient' && role !== 'caregiver')) {
      socket.close(4401, 'unauthorized');
      return;
    }
    if (role === 'patient' && !isLoopback(request.socket.remoteAddress)) {
      socket.close(4403, 'bedside only');
      return;
    }

    const peers = role === 'patient' ? patients : caregivers;
    const allowed = role === 'patient' ? PATIENT_EVENTS : CAREGIVER_EVENTS;
    const targets = role === 'patient' ? caregivers : patients;
    peers.add(socket);
    broadcast(caregivers, { type: 'presence', ts: Date.now(), payload: { patientOnline: patients.size > 0, caregivers: caregivers.size } });

    if (role === 'caregiver') {
      send(socket, { type: 'history', ts: Date.now(), payload: { events: history, lastVitals } });
    }

    let windowStart = Date.now();
    let count = 0;
    socket.on('message', (data, isBinary) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > RATE_LIMIT_PER_SECOND || isBinary) return;

      const result = parseEvent(data.toString(), allowed);
      if (!result.ok) {
        send(socket, { type: 'error', ts: now, payload: { reason: result.error } });
        return;
      }
      const event = result.event;
      if (event.type === 'vitals') lastVitals = event;
      else {
        history.push(event);
        if (history.length > HISTORY_LIMIT) history.shift();
      }
      broadcast(targets, event);
      // Caregivers also see what other caregivers did (e.g. who acknowledged an alert).
      if (role === 'caregiver') broadcast(caregivers, event, socket);
    });

    socket.on('close', () => {
      peers.delete(socket);
      broadcast(caregivers, { type: 'presence', ts: Date.now(), payload: { patientOnline: patients.size > 0, caregivers: caregivers.size } });
    });
  });

  return {
    server,
    token,
    listen: () => new Promise((resolve) => server.listen(port, () => resolve(server.address().port))),
    close: () =>
      new Promise((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}

function send(socket, event) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
}

function broadcast(sockets, event, except = null) {
  const frame = JSON.stringify(event);
  for (const socket of sockets) if (socket !== except && socket.readyState === socket.OPEN) socket.send(frame);
}

function tokensMatch(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isLoopback(address = '') {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** Best guess at the address phones on the same Wi-Fi or hotspot can reach. */
export function lanAddress() {
  const candidates = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal);
  const preferred = candidates.find((c) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(c.address));
  return (preferred ?? candidates[0])?.address ?? 'localhost';
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const relay = createRelay();
  const port = await relay.listen();
  const caregiverUrl = `http://${lanAddress()}:${port}/caregiver.html#${relay.token}`;
  console.log(`\n  3ayni is running\n`);
  console.log(`  Bedside screen  : http://localhost:${port}   (open on this computer)`);
  console.log(`  Caregiver phone : ${caregiverUrl}`);
  console.log(`                    (or scan the QR code shown on the bedside screen)\n`);
  console.log(await QRCode.toString(caregiverUrl, { type: 'terminal', small: true }));
}
