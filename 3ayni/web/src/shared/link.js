// WebSocket connection to the relay with automatic reconnection. While the
// link is down, important events (messages, alerts) are queued and sent once
// it comes back; vitals are not queued because only the latest one matters.

const QUEUED_TYPES = new Set(['message', 'alert', 'status', 'question', 'ack']);
const MAX_QUEUE = 50;

export class RelayLink {
  /**
   * @param {{role: 'patient'|'caregiver', token: string, onEvent: (event: object) => void, onStatus?: (online: boolean) => void}} options
   */
  constructor({ role, token, onEvent, onStatus = () => {} }) {
    this.role = role;
    this.token = token;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.queue = [];
    this.retryMs = 500;
    this.socket = null;
    this.closedByUser = false;
    this.#connect();
  }

  get online() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  send(type, payload) {
    const event = { type, ts: Date.now(), payload };
    if (this.online) {
      this.socket.send(JSON.stringify(event));
    } else if (QUEUED_TYPES.has(type)) {
      this.queue.push(event);
      if (this.queue.length > MAX_QUEUE) this.queue.shift();
    }
  }

  close() {
    this.closedByUser = true;
    this.socket?.close();
  }

  #connect() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({ role: this.role, token: this.token });
    const socket = new WebSocket(`${scheme}://${location.host}/ws?${params}`);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.retryMs = 500;
      this.onStatus(true);
      for (const event of this.queue.splice(0)) socket.send(JSON.stringify(event));
    });
    socket.addEventListener('message', (message) => {
      try {
        this.onEvent(JSON.parse(message.data));
      } catch (error) {
        console.warn('Ignoring malformed event', error);
      }
    });
    socket.addEventListener('close', (event) => {
      this.onStatus(false);
      if (this.closedByUser || event.code === 4401 || event.code === 4403) return; // do not retry a refused pairing
      setTimeout(() => this.#connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 8000);
    });
  }
}
