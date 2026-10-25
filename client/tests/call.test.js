import test from 'node:test';
import assert from 'node:assert/strict';

import { CallSession, CallStatus } from '../src/webrtc/call.js';
import { AudioActivityTracker } from '../src/webrtc/audioActivity.js';

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

if (!globalThis.navigator) {
  globalThis.navigator = {};
}
if (!globalThis.navigator.mediaDevices) {
  globalThis.navigator.mediaDevices = {};
}
if (!globalThis.window) {
  globalThis.window = { location: { origin: 'http://localhost:5173' } };
}

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

test('Screen sharing: startScreenShare, cancellation, and remote stream resolution', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.mockJoinPeers = [
    { peerId: 'p1', user: { id: 'u1', name: 'User 1' }, audio: true, video: true },
  ];

  let displayMediaStream = null;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getDisplayMedia: async () => {
        const track = {
          kind: 'video',
          stop: () => {},
          onended: null,
        };
        displayMediaStream = {
          id: 'mock-screen-stream-id',
          getTracks: () => [track],
          getVideoTracks: () => [track],
        };
        return displayMediaStream;
      },
    },
    configurable: true,
    writable: true,
  });

  const call = new CallSession({
    code: 'test-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  // User starts screen sharing
  await call.startScreenShare();
  assert.equal(call.getState().screenShare?.peerId, 'self-peer-id');
  assert.equal(call.getState().screenShare?.streamId, 'mock-screen-stream-id');
  assert.equal(call.getState().screenStream?.id, 'mock-screen-stream-id');

  // Verify share:start was sent via signaling
  const shareReq = mockSignaling.sentRequests.find((r) => r.event === 'share:start');
  assert.ok(shareReq);
  assert.equal(shareReq.payload.streamId, 'mock-screen-stream-id');

  // User stops screen sharing
  call.stopScreenShare();
  assert.equal(call.getState().screenShare, null);
  assert.equal(call.getState().screenStream, null);

  // Cancellation (NotAllowedError) should not throw
  globalThis.navigator.mediaDevices.getDisplayMedia = async () => {
    const err = new Error('Permission denied');
    err.name = 'NotAllowedError';
    throw err;
  };
  await assert.doesNotReject(async () => {
    await call.startScreenShare();
  });

  call.leave();
});

test('Active speaker: AudioActivityTracker tracks and untracks streams gracefully', () => {
  let currentSpeaker = null;
  const tracker = new AudioActivityTracker({
    onSpeakerChange: (speakerId) => {
      currentSpeaker = speakerId;
    },
  });

  assert.equal(currentSpeaker, null);
  // Without AudioContext in node environment, trackStream is safe no-op
  const mockStream = { getAudioTracks: () => [{ readyState: 'live', enabled: true }] };
  tracker.trackStream('peer-1', mockStream);
  tracker.untrackStream('peer-1');
  tracker.destroy();
  assert.equal(currentSpeaker, null);
});

test('Reconnect behavior: enters reconnecting, recovers without duplicates, reloads history', async () => {
  const mockSignaling = new MockSignaling();
  let historyLoadCount = 0;
  const mockMessages = [
    { id: 'msg-1', text: 'Hello', createdAt: '2026-10-25T00:00:00Z', from: { id: 'u1', name: 'Alice' } },
  ];

  mockSignaling.mockJoinPeers = [
    { peerId: 'p1', user: { id: 'u1', name: 'Alice' }, audio: true, video: true },
  ];

  const call = new CallSession({
    code: 'reconnect-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => {
      historyLoadCount += 1;
      return mockMessages;
    },
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(call.getState().status, CallStatus.ACTIVE);
  assert.equal(call.getState().peers.length, 1);
  assert.equal(call.getState().messages.length, 1);
  assert.equal(historyLoadCount, 1);

  // Network drops: signaling enters reconnecting
  mockSignaling.emit('status', { status: 'reconnecting' });
  assert.equal(call.getState().status, CallStatus.RECONNECTING);
  assert.equal(call.getState().peers.length, 0); // closed peers

  // Network recovers: signaling enters connected
  mockSignaling.emit('status', { status: 'connected' });
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(call.getState().status, CallStatus.ACTIVE);
  assert.equal(call.getState().peers.length, 1); // 1 peer restored, no duplicate tiles
  assert.equal(call.getState().messages.length, 1); // no duplicate messages
  assert.equal(historyLoadCount, 2); // history reloaded

  call.leave();
});

test('Edge cases: host leaving mid-call removes peer cleanly', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.mockJoinPeers = [
    { peerId: 'host-peer', user: { id: 'host-1', name: 'Host Alice' }, audio: true, video: true },
  ];

  const call = new CallSession({
    code: 'host-leave-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(call.getState().peers.length, 1);

  // Host leaves
  mockSignaling.emit('room:peer-left', { peerId: 'host-peer' });
  assert.equal(call.getState().peers.length, 0);

  call.leave();
});

test('Edge cases: joining ended meeting transitions to ENDED', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.request = async (event) => {
    if (event === 'room:join') {
      const err = new Error('This meeting has ended');
      err.code = 'MEETING_ENDED';
      throw err;
    }
    return {};
  };

  const call = new CallSession({
    code: 'ended-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(call.getState().status, CallStatus.ENDED);
  call.leave();
});

test('Edge cases: joining full meeting transitions to ERROR with ROOM_FULL', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.request = async (event) => {
    if (event === 'room:join') {
      const err = new Error('This meeting is full');
      err.code = 'ROOM_FULL';
      throw err;
    }
    return {};
  };

  const call = new CallSession({
    code: 'full-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(call.getState().status, CallStatus.ERROR);
  assert.equal(call.getState().error?.code, 'ROOM_FULL');
  call.leave();
});

test('Host client: calls host:list-waiting on start and updates waitingList', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.request = async (event, payload) => {
    mockSignaling.sentRequests.push({ event, payload });
    if (event === 'room:join') {
      return {
        status: 'admitted',
        peerId: 'host-peer-id',
        isHost: true,
        peers: [],
        screenSharer: null,
      };
    }
    if (event === 'host:list-waiting') {
      return {
        ok: true,
        waiting: [{ peerId: 'guest-1', user: { id: 'u2', name: 'Bob' } }],
      };
    }
    return {};
  };

  const call = new CallSession({
    code: 'host-waiting-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(call.getState().isHost, true);
  const listWaitingReq = mockSignaling.sentRequests.find((r) => r.event === 'host:list-waiting');
  assert.ok(listWaitingReq, 'Sent host:list-waiting request');
  assert.equal(listWaitingReq.payload.code, 'host-waiting-room');
  assert.equal(call.getState().waitingList.length, 1);
  assert.equal(call.getState().waitingList[0].peerId, 'guest-1');

  call.leave();
});

test('Guest client: auto-rejoins on reconnect and acquires/releases wake lock while waiting', async () => {
  let wakeLockRequested = 0;
  let wakeLockReleased = 0;
  globalThis.navigator.wakeLock = {
    request: async (type) => {
      wakeLockRequested += 1;
      return {
        type,
        release: async () => {
          wakeLockReleased += 1;
        },
      };
    },
  };

  const mockSignaling = new MockSignaling();
  let joinCalls = 0;
  mockSignaling.request = async (event, payload) => {
    mockSignaling.sentRequests.push({ event, payload });
    if (event === 'room:join') {
      joinCalls += 1;
      return {
        status: 'waiting',
        hostInRoom: true,
      };
    }
    return {};
  };

  const call = new CallSession({
    code: 'guest-waiting-room',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(call.getState().status, CallStatus.WAITING);
  assert.equal(call.getState().isReconnecting, false);
  assert.equal(joinCalls, 1);
  assert.equal(wakeLockRequested, 1, 'Wake lock requested when waiting');

  // Socket drops
  mockSignaling.emit('status', { status: 'reconnecting' });
  assert.equal(call.getState().status, CallStatus.WAITING);
  assert.equal(call.getState().isReconnecting, true);

  // Socket reconnects
  mockSignaling.emit('status', { status: 'connected' });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(joinCalls, 2, 'Re-issued room:join on reconnect');
  assert.equal(call.getState().status, CallStatus.WAITING);
  assert.equal(call.getState().isReconnecting, false);

  // Admitted
  mockSignaling.emit('room:admitted', { peerId: 'guest-peer-id', peers: [] });
  assert.equal(call.getState().status, CallStatus.ACTIVE);
  assert.equal(wakeLockReleased, 1, 'Wake lock released on admit');

  call.leave();
});

test('Repeated events: room:ended and room:admitted are harmless and idempotent', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.request = async (event) => {
    if (event === 'room:join') {
      return { status: 'waiting', hostInRoom: true };
    }
    return {};
  };

  const call = new CallSession({
    code: 'repeated-events-test',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(call.getState().status, CallStatus.WAITING);

  // First room:admitted
  mockSignaling.emit('room:admitted', { peerId: 'peer-1', peers: [] });
  assert.equal(call.getState().status, CallStatus.ACTIVE);
  assert.equal(call.getState().selfId, 'peer-1');

  // Second room:admitted (repeated) -> changes nothing, does not throw
  mockSignaling.emit('room:admitted', { peerId: 'peer-1', peers: [] });
  assert.equal(call.getState().status, CallStatus.ACTIVE);
  assert.equal(call.getState().selfId, 'peer-1');

  // First room:ended
  mockSignaling.emit('room:ended', {});
  assert.equal(call.getState().status, CallStatus.ENDED);

  // Second room:ended (repeated) -> changes nothing, does not throw
  mockSignaling.emit('room:ended', {});
  assert.equal(call.getState().status, CallStatus.ENDED);

  call.leave();
});

test('host:end finishes session immediately as ENDED', async () => {
  const mockSignaling = new MockSignaling();
  let endCalled = false;
  mockSignaling.request = async (event) => {
    if (event === 'room:join') {
      return { status: 'admitted', peerId: 'host-id', isHost: true, peers: [] };
    }
    if (event === 'host:end') {
      endCalled = true;
      return {};
    }
    return {};
  };

  const call = new CallSession({
    code: 'host-end-test',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(call.getState().status, CallStatus.ACTIVE);
  assert.equal(call.getState().isHost, true);

  await call.endMeeting();
  assert.equal(endCalled, true);
  assert.equal(call.getState().status, CallStatus.ENDED);
});

test('Guest in WAITING polls room:status and transitions to ACTIVE on admitted', async () => {
  const mockSignaling = new MockSignaling();
  let statusPolled = 0;
  mockSignaling.request = async (event) => {
    if (event === 'room:join') {
      return { status: 'waiting', hostInRoom: true };
    }
    if (event === 'room:status') {
      statusPolled += 1;
      return {
        status: 'admitted',
        peerId: 'guest-polled-id',
        peers: [],
      };
    }
    return {};
  };

  const call = new CallSession({
    code: 'guest-status-poll',
    url: 'http://localhost:5000',
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(call.getState().status, CallStatus.WAITING);

  // Trigger reconnect which calls #pollGuestStatus immediately
  mockSignaling.emit('status', { status: 'connected' });
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(call.getState().status, CallStatus.ACTIVE);
  assert.equal(call.getState().selfId, 'guest-polled-id');
  assert.ok(statusPolled >= 1);

  call.leave();
});

test('Chat: sender own message is confirmed immediately on ack and deduplicated by id', async () => {
  const mockSignaling = new MockSignaling();
  mockSignaling.request = async (event, payload) => {
    if (event === 'room:join') {
      return { status: 'admitted', peerId: 'p-self', isHost: false, peers: [] };
    }
    if (event === 'chat:send') {
      return {
        ok: true,
        message: {
          id: 'server-msg-1',
          text: payload.text,
          from: { id: 'u-self', name: 'Self', isHost: false },
          createdAt: new Date().toISOString(),
        },
      };
    }
    return {};
  };

  const call = new CallSession({
    code: 'chat-test-room',
    url: 'http://localhost:5000',
    currentUser: { id: 'u-self', name: 'Self' },
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async () => [],
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  await call.sendMessage('Hello world');
  const msgs = call.getState().messages;
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].id, 'server-msg-1');
  assert.equal(msgs[0].status, 'delivered');

  // Socket broadcast also arrives with same id -> no duplicates
  mockSignaling.emit('chat:message', {
    id: 'server-msg-1',
    text: 'Hello world',
    from: { id: 'u-self', name: 'Self', isHost: false },
    createdAt: msgs[0].createdAt,
  });
  assert.equal(call.getState().messages.length, 1);

  call.leave();
});

test('Chat: syncs with GET messages?after=<lastId> and merges by id maintaining stable order', async () => {
  const mockSignaling = new MockSignaling();
  const apiCalls = [];
  const storedMessages = [
    { id: 'msg-1', text: 'Msg 1', from: { id: 'u1', name: 'Alice' }, createdAt: '2026-10-25T00:00:01Z' },
    { id: 'msg-2', text: 'Msg 2', from: { id: 'u2', name: 'Bob' }, createdAt: '2026-10-25T00:00:02Z' },
  ];

  const call = new CallSession({
    code: 'sync-test-room',
    url: 'http://localhost:5000',
    currentUser: { id: 'u1', name: 'Alice' },
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
    getMeetingMessagesApi: async (code, limit, options) => {
      apiCalls.push({ code, limit, options });
      if (options?.after) {
        return storedMessages.filter((m) => m.id > options.after);
      }
      return storedMessages.slice(0, 1); // initial load returns msg-1
    },
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  // Initial load loaded msg-1
  assert.equal(call.getState().messages.length, 1);
  assert.equal(call.getState().messages[0].id, 'msg-1');

  // Trigger syncChat
  await call.syncChat();

  // Second message msg-2 is merged
  assert.equal(call.getState().messages.length, 2);
  assert.equal(call.getState().messages[0].id, 'msg-1');
  assert.equal(call.getState().messages[1].id, 'msg-2');

  // Verify that options.after was passed as msg-1
  assert.equal(apiCalls[apiCalls.length - 1].options.after, 'msg-1');

  call.leave();
});



