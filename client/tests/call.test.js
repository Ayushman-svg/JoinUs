import test from 'node:test';
import assert from 'node:assert/strict';

import { CallSession, CallStatus } from '../src/webrtc/call.js';

// Mock RTCPeerConnection for testing pure call logic without WebRTC browser globals
class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.connectionState = 'new';
    this.signalingState = 'stable';
    this.localDescription = null;
    this.remoteDescription = null;
    this.closed = false;
    this.senders = [];
  }

  addTrack(track, stream) {
    const sender = { track };
    this.senders.push(sender);
    return sender;
  }

  removeTrack(sender) {
    this.senders = this.senders.filter((s) => s !== sender);
  }

  getSenders() {
    return this.senders;
  }

  addTransceiver() {}

  async setLocalDescription(desc) {
    if (desc?.type === 'rollback') {
      this.signalingState = 'stable';
      this.localDescription = null;
      return;
    }
    this.localDescription = desc || { type: 'offer', sdp: 'mock-local-sdp' };
    this.signalingState = this.localDescription.type === 'offer' ? 'have-local-offer' : 'stable';
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
    this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
  }

  close() {
    this.closed = true;
    this.connectionState = 'closed';
  }
}

globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.MediaStream = class MockMediaStream {
  constructor(tracks = []) {
    this.tracks = tracks;
    this.id = `stream-${Math.random().toString(36).slice(2, 8)}`;
  }
  getTracks() {
    return this.tracks;
  }
};

class MockSignaling {
  constructor() {
    this.listeners = new Map();
    this.connected = true;
    this.sentRequests = [];
  }

  on(event, handler) {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
    return () => {
      this.listeners.set(event, (this.listeners.get(event) ?? []).filter((h) => h !== handler));
    };
  }

  emit(event, data) {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) h(data);
  }

  send(event, payload) {
    this.sentRequests.push({ event, payload });
  }

  async request(event, payload) {
    this.sentRequests.push({ event, payload });
    if (event === 'room:join') {
      return {
        status: 'admitted',
        peerId: 'self-peer-id',
        isHost: false,
        peers: this.mockJoinPeers || [],
        screenSharer: null,
      };
    }
    if (event === 'signal') {
      return {};
    }
    return {};
  }

  connect() {
    this.emit('status', { status: 'connected' });
  }

  close() {
    this.connected = false;
  }
}

test('Multi-party call logic: newcomer initiates offers to all existing peers', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.mockJoinPeers = [
    { peerId: 'peer-alice', user: { id: 'u1', name: 'Alice' } },
    { peerId: 'peer-bob', user: { id: 'u2', name: 'Bob' } },
    { peerId: 'peer-charlie', user: { id: 'u3', name: 'Charlie' } },
  ];

  const call = new CallSession({
    code: 'test-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  // Wait for asynchronous join resolution
  await new Promise((r) => setTimeout(r, 10));

  const state = call.getState();
  assert.equal(state.status, CallStatus.ACTIVE);
  assert.equal(state.peers.length, 3);

  // Verify newcomer initiated peer connections to all 3 existing participants
  const alicePeer = call.peers.get('peer-alice')?.peer;
  const bobPeer = call.peers.get('peer-bob')?.peer;
  const charliePeer = call.peers.get('peer-charlie')?.peer;

  assert.equal(alicePeer.initiator, true);
  assert.equal(bobPeer.initiator, true);
  assert.equal(charliePeer.initiator, true);

  call.leave();
});

test('Multi-party call logic: existing peer does not initiate when newcomer arrives', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.mockJoinPeers = [];

  const call = new CallSession({
    code: 'test-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  // Dave joins the room
  mockSignaling.emit('room:peer-joined', {
    peerId: 'peer-dave',
    user: { id: 'u4', name: 'Dave' },
    audio: true,
    video: true,
  });

  const state = call.getState();
  assert.equal(state.peers.length, 1);
  assert.equal(state.peers[0].peerId, 'peer-dave');

  const davePeer = call.peers.get('peer-dave')?.peer;
  // Existing peer must NOT initiate first offer: newcomer will send it
  assert.equal(davePeer.initiator, false);

  call.leave();
});

test('Multi-party call logic: polarity derivation is strictly deterministic and opposite', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.mockJoinPeers = [
    { peerId: 'aaa-peer', user: { id: 'u1', name: 'A' } }, // 'self-peer-id' < 'aaa-peer' is false -> polite = false
    { peerId: 'zzz-peer', user: { id: 'u2', name: 'Z' } }, // 'self-peer-id' < 'zzz-peer' is true -> polite = true
  ];

  const call = new CallSession({
    code: 'test-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  const peerA = call.peers.get('aaa-peer')?.peer;
  const peerZ = call.peers.get('zzz-peer')?.peer;

  assert.equal(peerA.polite, false); // 'self-peer-id' < 'aaa-peer' is false
  assert.equal(peerZ.polite, true);  // 'self-peer-id' < 'zzz-peer' is true

  call.leave();
});

test('Multi-party call logic: peer cleanup and media state updates for N peers', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.mockJoinPeers = [
    { peerId: 'p1', user: { id: 'u1', name: 'User 1' }, audio: true, video: true },
    { peerId: 'p2', user: { id: 'u2', name: 'User 2' }, audio: true, video: true },
  ];

  const call = new CallSession({
    code: 'test-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(call.getState().peers.length, 2);

  // p1 mutes microphone
  mockSignaling.emit('room:peer-updated', { peerId: 'p1', audio: false, video: true });
  assert.equal(call.getState().peers.find((p) => p.peerId === 'p1').audio, false);
  assert.equal(call.getState().peers.find((p) => p.peerId === 'p2').audio, true);

  // p2 leaves
  mockSignaling.emit('room:peer-left', { peerId: 'p2' });
  assert.equal(call.getState().peers.length, 1);
  assert.equal(call.getState().peers[0].peerId, 'p1');

  call.leave();
});
