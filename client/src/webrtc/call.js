// Joins a meeting room and keeps one Peer per other participant. Plain JavaScript, no React.
//
//   const call = new CallSession({ code, url, getToken, localStream });
//   const off = call.on('state', (state) => ...);
//   call.start();
//   ...
//   call.leave();
//
// state = { status, error, selfId, peers: [{ peerId, user, stream, connectionState, audio, video }] }
// audio and video say whether that person's microphone and camera are on. The server relays
// them, because WebRTC cannot tell the difference between a muted sender and a silent room.
// A dropped connection is recovered by joining the room again from scratch: the server has
// already removed the old session, so the old peer connections are replaced by new ones.
import { Peer, DEFAULT_RTC_CONFIG } from './peer.js';
import { createSignaling, SignalingStatus } from './signaling.js';

export const CallStatus = Object.freeze({
  CONNECTING: 'connecting', // opening the connection to the meeting server
  JOINING: 'joining', // connected, asking to enter the room
  WAITING: 'waiting', // in waiting room, waiting for host admission
  ACTIVE: 'active', // in the room, alone or with others
  DENIED: 'denied', // host denied admission
  REMOVED: 'removed', // removed from meeting by host
  ENDED: 'ended', // meeting ended by host
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
    // Returns { audio, video }: whether our microphone and camera are on right now
    getLocalMedia = () => ({ audio: true, video: true }),
    rtcConfig = DEFAULT_RTC_CONFIG,
    createSignalingClient = createSignaling,
  }) {
    this.code = code;
    this.url = url;
    this.getToken = getToken;
    this.localStream = localStream;
    this.getLocalMedia = getLocalMedia;
    this.rtcConfig = rtcConfig;
    this.createSignalingClient = createSignalingClient;

    this.listeners = new Set();
    this.signaling = null;
    this.unsubscribe = [];
    this.peers = new Map(); // peerId -> { peer, user, stream, connectionState }
    this.pending = new Map(); // peerId -> signals that arrived before the peer was announced
    this.earlyPeers = [];
    this.waitingList = [];
    this.hostInRoom = true;
    this.selfId = null;
    this.joinAttempt = 0;
    this.finished = false;

    this.state = {
      status: CallStatus.CONNECTING,
      error: null,
      selfId: null,
      peers: [],
      waitingList: [],
      hostInRoom: true,
    };
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
      signaling.on('room:peer-updated', (update) => this.#updatePeerMedia(update)),
      signaling.on('room:kicked', ({ reason }) => this.#finish(CallStatus.KICKED, { reason })),
      signaling.on('room:waiting-updated', ({ waiting }) => this.#onWaitingUpdated(waiting)),
      signaling.on('room:admitted', (data) => this.#onAdmitted(data)),
      signaling.on('room:denied', () => this.#finish(CallStatus.DENIED)),
      signaling.on('room:removed', ({ reason } = {}) =>
        this.#finish(CallStatus.REMOVED, { reason: reason || 'REMOVED_BY_HOST' })
      ),
      signaling.on('room:ended', () => this.#finish(CallStatus.ENDED)),
      signaling.on('signal', (message) => this.#onSignal(message)),
    ];

    this.#update({ status: CallStatus.CONNECTING });
    signaling.connect();
  }

  async admitPeer(peerId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:admit', { peerId });
  }

  async denyPeer(peerId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:deny', { peerId });
  }

  async admitAllPeers() {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:admit-all', {});
  }

  async removePeer(peerId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:remove', { peerId });
  }

  async endMeeting() {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:end', {});
  }

  // Tell the others that our microphone or camera was switched on or off
  updateLocalMedia() {
    if (this.state.status === CallStatus.ACTIVE && this.signaling?.connected) {
      this.signaling.send('media:update', this.getLocalMedia());
    }
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
      const response = await this.signaling.request('room:join', {
        code: this.code,
        ...this.getLocalMedia(),
      });
      if (this.finished || attempt !== this.joinAttempt) return;

      if (response.status === 'waiting') {
        this.selfId = null;
        this.hostInRoom = response.hostInRoom !== false;
        this.#update({
          status: CallStatus.WAITING,
          selfId: null,
          hostInRoom: this.hostInRoom,
        });
        return;
      }

      this.selfId = response.peerId;
      this.#update({ status: CallStatus.ACTIVE, selfId: this.selfId });

      // Everyone already in the room is offered a connection by us, the newcomer. Peers that
      // joined while the answer was on its way (earlyPeers) will send their own offers.
      const waiting = this.earlyPeers;
      this.earlyPeers = [];
      for (const info of response.peers || []) this.#addPeer(info, { initiator: true });
      for (const info of waiting) this.#addPeer(info, { initiator: false });
    } catch (err) {
      if (this.finished || attempt !== this.joinAttempt) return;
      if (err?.code === 'MEETING_ENDED') {
        this.#finish(CallStatus.ENDED);
        return;
      }
      this.#finish(CallStatus.ERROR, { error: toCallError(err) });
    }
  }

  #onWaitingUpdated(waiting) {
    if (this.finished) return;
    this.waitingList = Array.isArray(waiting) ? waiting : [];
    this.#update({ waitingList: this.waitingList });
  }

  #onAdmitted({ peerId, peers }) {
    if (this.finished) return;
    this.selfId = peerId;
    this.#update({ status: CallStatus.ACTIVE, selfId: this.selfId });
    this.updateLocalMedia();

    const waiting = this.earlyPeers;
    this.earlyPeers = [];
    for (const info of peers || []) this.#addPeer(info, { initiator: true });
    for (const info of waiting) this.#addPeer(info, { initiator: false });
  }

  #addPeer({ peerId, user, audio = true, video = true }, { initiator }) {
    if (this.finished || this.peers.has(peerId)) return;
    if (!this.selfId) {
      this.earlyPeers.push({ peerId, user, audio, video });
      return;
    }

    const entry = { peer: null, user, stream: null, connectionState: 'new', audio, video };
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

  #updatePeerMedia({ peerId, audio, video }) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.audio = audio;
    entry.video = video;
    this.#update();
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
    if ('waitingList' in patch) this.waitingList = patch.waitingList;
    if ('hostInRoom' in patch) this.hostInRoom = patch.hostInRoom;
    this.state = {
      ...this.state,
      ...patch,
      waitingList: this.waitingList,
      hostInRoom: this.hostInRoom,
      peers: [...this.peers.entries()].map(([peerId, entry]) => ({
        peerId,
        user: entry.user,
        stream: entry.stream,
        connectionState: entry.connectionState,
        audio: entry.audio,
        video: entry.video,
      })),
    };
    this.listeners.forEach((listener) => listener(this.state));
  }
}

function toCallError(err) {
  return { code: err?.code ?? 'UNKNOWN', message: err?.message ?? 'Something went wrong' };
}
