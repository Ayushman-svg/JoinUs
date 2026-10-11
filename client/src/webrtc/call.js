// Joins a meeting room and keeps one Peer per other participant. Plain JavaScript, no React.
//
//   const call = new CallSession({ code, url, getToken, localStream });
//   const off = call.on('state', (state) => ...);
//   call.start();
//   ...
//   call.leave();
//
// state = { status, error, selfId, peers: [{ peerId, user, stream, connectionState }] }
// A dropped connection is recovered by joining the room again from scratch: the server has
// already removed the old session, so the old peer connections are replaced by new ones.
import { Peer, DEFAULT_RTC_CONFIG } from './peer.js';
import { createSignaling, SignalingStatus } from './signaling.js';

export const CallStatus = Object.freeze({
  CONNECTING: 'connecting', // opening the connection to the meeting server
  JOINING: 'joining', // connected, asking to enter the room
  ACTIVE: 'active', // in the room, alone or with others
  RECONNECTING: 'reconnecting', // the connection dropped, retrying
  ERROR: 'error', // could not join, or the server refused us (see state.error)
  KICKED: 'kicked', // the same user joined from another tab
  LEFT: 'left',
});

const PENDING_LIMIT = 50;
const PENDING_TTL_MS = 10_000;

export class CallSession {
  constructor({
    code,
    url,
    getToken,
    localStream = null,
    rtcConfig = DEFAULT_RTC_CONFIG,
    createSignalingClient = createSignaling,
  }) {
    this.code = code;
    this.url = url;
    this.getToken = getToken;
    this.localStream = localStream;
    this.rtcConfig = rtcConfig;
    this.createSignalingClient = createSignalingClient;

    this.listeners = new Set();
    this.signaling = null;
    this.unsubscribe = [];
    this.peers = new Map(); // peerId -> { peer, user, stream, connectionState }
    this.pending = new Map(); // peerId -> signals that arrived before the peer was announced
    this.earlyPeers = [];
    this.selfId = null;
    this.joinAttempt = 0;
    this.finished = false;

    this.state = { status: CallStatus.CONNECTING, error: null, selfId: null, peers: [] };
  }

  getState() {
    return this.state;
  }

  on(event, handler) {
    if (event !== 'state') throw new Error(`Unknown call event "${event}"`);
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  start() {
    if (this.signaling || this.finished) return;

    const signaling = this.createSignalingClient({ url: this.url, getToken: this.getToken });
    this.signaling = signaling;
    this.unsubscribe = [
      signaling.on('status', (event) => this.#onSignalingStatus(event)),
      // Someone joined after us: they make the first offer
      signaling.on('room:peer-joined', (info) => this.#addPeer(info, { initiator: false })),
      signaling.on('room:peer-left', ({ peerId }) => this.#removePeer(peerId)),
      signaling.on('room:kicked', ({ reason }) => this.#finish(CallStatus.KICKED, { reason })),
      signaling.on('signal', (message) => this.#onSignal(message)),
    ];

    this.#update({ status: CallStatus.CONNECTING });
    signaling.connect();
  }

  // Leaves the room and closes everything. Safe to call more than once.
  leave() {
    if (this.finished) return;
    if (this.signaling?.connected) this.signaling.send('room:leave');
    this.#finish(CallStatus.LEFT);
  }

  #onSignalingStatus({ status, error }) {
    if (this.finished) return;

    if (status === SignalingStatus.CONNECTING) {
      this.#update({ status: CallStatus.CONNECTING });
    } else if (status === SignalingStatus.CONNECTED) {
      this.#join();
    } else if (status === SignalingStatus.RECONNECTING) {
      this.joinAttempt += 1; // forget a join that was still waiting for its answer
      this.#closePeers();
      this.selfId = null;
      this.#update({ status: CallStatus.RECONNECTING, selfId: null });
    } else if (status === SignalingStatus.FAILED) {
      this.#finish(CallStatus.ERROR, { error: toCallError(error) });
    }
  }

  async #join() {
    this.joinAttempt += 1;
    const attempt = this.joinAttempt;
    this.earlyPeers = [];
    this.#update({ status: CallStatus.JOINING });

    try {
      const response = await this.signaling.request('room:join', { code: this.code });
      if (this.finished || attempt !== this.joinAttempt) return;

      this.selfId = response.peerId;
      this.#update({ status: CallStatus.ACTIVE, selfId: this.selfId });

      // Everyone already in the room is offered a connection by us, the newcomer. Peers that
      // joined while the answer was on its way (earlyPeers) will send their own offers.
      const waiting = this.earlyPeers;
      this.earlyPeers = [];
      for (const info of response.peers) this.#addPeer(info, { initiator: true });
      for (const info of waiting) this.#addPeer(info, { initiator: false });
    } catch (err) {
      if (this.finished || attempt !== this.joinAttempt) return;
      this.#finish(CallStatus.ERROR, { error: toCallError(err) });
    }
  }

  #addPeer({ peerId, user }, { initiator }) {
    if (this.finished || this.peers.has(peerId)) return;
    if (!this.selfId) {
      this.earlyPeers.push({ peerId, user });
      return;
    }

    const entry = { peer: null, user, stream: null, connectionState: 'new' };
    entry.peer = new Peer({
      remoteId: peerId,
      // Opposite roles on the two sides: the smaller id is the polite one
      polite: this.selfId < peerId,
      initiator,
      localStream: this.localStream,
      rtcConfig: this.rtcConfig,
      sendSignal: (message) => this.signaling.request('signal', { to: peerId, ...message }),
      onRemoteStream: (stream) => {
        entry.stream = stream;
        this.#update();
      },
      onConnectionState: (connectionState) => {
        entry.connectionState = connectionState;
        this.#update();
      },
      onError: (err) => console.warn(`Peer ${peerId}: ${err.code}`, err.cause ?? err.message),
    });
    this.peers.set(peerId, entry);
    this.#update();

    this.#replayPending(peerId, entry.peer);
  }

  #removePeer(peerId) {
    this.pending.delete(peerId);
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.peer.close();
    this.peers.delete(peerId);
    this.#update();
  }

  #onSignal(message) {
    const entry = this.peers.get(message.from);
    if (entry) {
      entry.peer.handleSignal(message);
      return;
    }
    // A signal can overtake the announcement of its sender: keep it for a moment
    const list = this.pending.get(message.from) ?? [];
    if (list.length < PENDING_LIMIT) list.push({ message, at: Date.now() });
    this.pending.set(message.from, list);
  }

  #replayPending(peerId, peer) {
    const list = this.pending.get(peerId) ?? [];
    this.pending.delete(peerId);
    for (const { message, at } of list) {
      if (Date.now() - at <= PENDING_TTL_MS) peer.handleSignal(message);
    }
  }

  #closePeers() {
    for (const { peer } of this.peers.values()) peer.close();
    this.peers.clear();
    this.pending.clear();
    this.earlyPeers = [];
  }

  // Ends the session for good with a final status
  #finish(status, extra = {}) {
    if (this.finished) return;
    this.finished = true;
    this.#closePeers();
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.signaling?.close();
    this.signaling = null;
    this.selfId = null;
    this.#update({ status, error: null, selfId: null, ...extra });
  }

  #update(patch = {}) {
    this.state = {
      ...this.state,
      ...patch,
      peers: [...this.peers.entries()].map(([peerId, entry]) => ({
        peerId,
        user: entry.user,
        stream: entry.stream,
        connectionState: entry.connectionState,
      })),
    };
    this.listeners.forEach((listener) => listener(this.state));
  }
}

function toCallError(err) {
  return { code: err?.code ?? 'UNKNOWN', message: err?.message ?? 'Something went wrong' };
}
