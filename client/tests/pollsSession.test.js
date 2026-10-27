import test from 'node:test';
import assert from 'node:assert/strict';

import { CallSession } from '../src/webrtc/call.js';

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

  addTrack(track) {
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
    this.localDescription = desc || { type: 'offer', sdp: 'mock-local-sdp' };
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
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
  }
  getTracks() {
    return this.tracks;
  }
};

class MockSignalingClient {
  constructor() {
    this.handlers = new Map();
    this.connected = true;
    this.id = 'sig-self';
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
    return () => {
      const arr = this.handlers.get(event) || [];
      this.handlers.set(
        event,
        arr.filter((h) => h !== handler)
      );
    };
  }

  emit(event, data) {
    for (const h of this.handlers.get(event) || []) h(data);
  }

  connect() {
    this.connected = true;
    this.emit('status', { status: 'connected' });
  }

  close() {
    this.connected = false;
    this.emit('status', { status: 'disconnected' });
  }

  send() {}
  async request() {
    return {};
  }
}

test('Polls: CallSession receives activePoll on join, handles launched/updated/closed events and actions', async () => {
  const mockSignaling = new MockSignalingClient();
  let requestedEvent = null;
  let requestedPayload = null;

  mockSignaling.request = async (event, payload) => {
    requestedEvent = event;
    requestedPayload = payload;
    if (event === 'room:join') {
      return {
        peerId: 'self-peer',
        isHost: true,
        role: 'host',
        peers: [],
        activePoll: {
          id: 'poll-1',
          question: 'Do you like polls?',
          options: [{ id: 'opt-1', text: 'Yes', votes: 1 }, { id: 'opt-2', text: 'No', votes: 0 }],
          status: 'open',
          totalVotes: 1,
        },
      };
    }
    if (event === 'poll:vote') {
      return {
        poll: {
          id: payload.pollId,
          question: 'Do you like polls?',
          options: [{ id: 'opt-1', text: 'Yes', votes: 2 }, { id: 'opt-2', text: 'No', votes: 0 }],
          status: 'open',
          totalVotes: 2,
          hasVoted: true,
          userVote: payload.optionIds,
        },
      };
    }
    if (event === 'poll:close') {
      return {
        poll: {
          id: payload.pollId,
          status: 'closed',
        },
      };
    }
    return {};
  };

  const call = new CallSession({
    code: 'poll-room',
    url: 'http://localhost:5000',
    currentUser: { id: 'u-host', name: 'Host' },
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
  });

  call.start();
  await new Promise((r) => setTimeout(r, 10));

  // Verify late joiner / initial room:join delivered activePoll
  assert.ok(call.getState().activePoll, 'activePoll should be populated from room:join');
  assert.equal(call.getState().activePoll.id, 'poll-1');
  assert.equal(call.getState().activePoll.totalVotes, 1);

  // Submit vote
  await call.submitVote('poll-1', ['opt-1']);
  assert.equal(requestedEvent, 'poll:vote');
  assert.deepEqual(requestedPayload, { pollId: 'poll-1', optionIds: ['opt-1'] });
  assert.equal(call.getState().activePoll.totalVotes, 2);
  assert.equal(call.getState().activePoll.hasVoted, true);

  // Poll update event
  mockSignaling.emit('poll:updated', {
    poll: {
      id: 'poll-1',
      totalVotes: 3,
      options: [{ id: 'opt-1', text: 'Yes', votes: 2 }, { id: 'opt-2', text: 'No', votes: 1 }],
    },
  });
  assert.equal(call.getState().activePoll.totalVotes, 3);

  // Poll closed event
  mockSignaling.emit('poll:closed', {
    poll: {
      id: 'poll-1',
      status: 'closed',
      totalVotes: 3,
    },
  });
  assert.equal(call.getState().activePoll.status, 'closed');

  // Dismiss poll
  call.dismissActivePoll();
  assert.equal(call.getState().activePoll, null);

  // Subsequent poll:closed event for the dismissed poll must not reactivate it
  mockSignaling.emit('poll:closed', {
    poll: {
      id: 'poll-1',
      status: 'closed',
      totalVotes: 3,
    },
  });
  assert.equal(call.getState().activePoll, null, 'Dismissed poll must remain null after poll:closed');

  // Launching a new poll with a new id must activate cleanly
  mockSignaling.emit('poll:launched', {
    poll: {
      id: 'poll-2',
      question: 'Next question?',
      options: [{ id: 'opt-2a', text: 'Option A' }, { id: 'opt-2b', text: 'Option B' }],
      status: 'open',
      totalVotes: 0,
    },
  });
  assert.ok(call.getState().activePoll, 'New poll must be active');
  assert.equal(call.getState().activePoll.id, 'poll-2');

  call.leave();
});
