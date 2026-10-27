// Socket.io client for the signaling protocol. Plain JavaScript with no React.
//
//   const signaling = createSignaling({ url, getToken });
//   signaling.on('status', ({ status, attempt, error }) => ...);
//   signaling.on('signal', (message) => ...);      // any server event of the protocol
//   signaling.connect();
//   const { peers } = await signaling.request('room:join', { code });
//
// Connection problems are retried with exponential backoff. A refused login (bad or expired
// token) is final: the status becomes "failed" and no retry happens.
import { io } from 'socket.io-client';

export const SignalingStatus = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting', // first connection attempt, including retries before it ever worked
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting', // the connection dropped after it had worked
  FAILED: 'failed', // refused by the server, will not retry
  CLOSED: 'closed', // closed by us
});

const SERVER_EVENTS = [
  'room:peer-joined',
  'room:peer-left',
  'room:peer-updated',
  'room:screen-updated',
  'room:waiting-updated',
  'room:admitted',
  'room:denied',
  'room:removed',
  'room:ended',
  'room:locked',
  'room:settings-changed',
  'peer:role-changed',
  'peer:renamed',
  'host:command-mute',
  'host:command-stop-video',
  'host:command-request-unmute',
  'chat:message',
  'reaction:new',
  'hand:changed',
  'feedback:changed',
  'poll:launched',
  'poll:updated',
  'poll:closed',
  'caption:segment',
  'signal',
  'room:kicked',
];
const FATAL_CODES = new Set(['UNAUTHORIZED', 'INVALID_TOKEN', 'TOKEN_EXPIRED']);

export class SignalingError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, { cause });
    this.name = 'SignalingError';
    this.code = code;
  }
}

export function createSignaling({ url, getToken, requestTimeout = 8000, socketOptions = {} }) {
  const listeners = new Map(); // event -> Set of handlers
  let socket = null;
  let status = SignalingStatus.IDLE;
  let attempt = 0;
  let hasConnected = false;

  function emit(event, data) {
    listeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        console.error(`Signaling handler for "${event}" failed`, err);
      }
    });
  }

  function setStatus(next, extra = {}) {
    status = next;
    emit('status', { status: next, attempt, ...extra });
  }

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event)?.delete(handler);
  }

  function connect() {
    if (socket) return;
    setStatus(SignalingStatus.CONNECTING);

    socket = io(url, {
      // A function, so every reconnect sends the current token
      auth: (callback) => callback({ token: getToken() }),
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000, // backoff: 1s, 2s, 4s, 8s, 8s ...
      randomizationFactor: 0.5,
      timeout: 20000, // a sleeping free-tier server can need a while to answer
      ...socketOptions,
    });

    for (const event of SERVER_EVENTS) socket.on(event, (data) => emit(event, data));
    if (typeof socket.onAny === 'function') {
      socket.onAny((event, ...args) => {
        if (!SERVER_EVENTS.includes(event)) {
          emit(event, args[0]);
        }
      });
    }

    socket.on('connect', () => {
      attempt = 0;
      hasConnected = true;
      setStatus(SignalingStatus.CONNECTED);
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return; // we closed it
      // The server dropped us on purpose: socket.io does not retry in that case, so we do
      if (reason === 'io server disconnect') socket.connect();
      setStatus(SignalingStatus.RECONNECTING, { reason });
    });

    socket.on('connect_error', (err) => {
      const code = err.data?.code;
      // socket.active is false when a handshake middleware refused us: retrying cannot help
      if (!socket.active || FATAL_CODES.has(code)) {
        socket.disconnect();
        setStatus(SignalingStatus.FAILED, {
          error: new SignalingError(code ?? 'CONNECTION_REFUSED', err.message, { cause: err }),
        });
        return;
      }
      attempt += 1;
      setStatus(hasConnected ? SignalingStatus.RECONNECTING : SignalingStatus.CONNECTING, {
        error: new SignalingError('CONNECTION_ERROR', err.message, { cause: err }),
      });
    });
  }

  // Sends an event and resolves with the ack data ({ ok: true, ...data }).
  // Rejects with a SignalingError: the server's error code, TIMEOUT or NOT_CONNECTED.
  async function request(event, payload, { timeout = requestTimeout } = {}) {
    if (!socket?.connected) {
      throw new SignalingError('NOT_CONNECTED', 'Not connected to the meeting server');
    }

    let response;
    try {
      response = await socket.timeout(timeout).emitWithAck(event, payload);
    } catch (err) {
      throw new SignalingError('TIMEOUT', 'The meeting server did not respond', { cause: err });
    }

    if (!response?.ok) {
      throw new SignalingError(
        response?.error?.code ?? 'UNKNOWN',
        response?.error?.message ?? 'The request failed'
      );
    }
    return response;
  }

  // Fire and forget, for when no answer is needed (for example while leaving)
  function send(event, payload) {
    socket?.emit(event, payload);
  }

  function close() {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    setStatus(SignalingStatus.CLOSED);
  }

  return {
    connect,
    close,
    request,
    send,
    on,
    get status() {
      return status;
    },
    get connected() {
      return Boolean(socket?.connected);
    },
    get id() {
      return socket?.id ?? null;
    },
  };
}
