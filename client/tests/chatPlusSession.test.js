import test from 'node:test';
import assert from 'node:assert/strict';

import { CallSession } from '../src/webrtc/call.js';

class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.connectionState = 'new';
    this.signalingState = 'stable';
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
  async setLocalDescription(desc) {
    this.localDescription = desc;
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
  async request(event, payload) {
    return {};
  }
}

test('ChatPlus: CallSession sends private and replyTo messages, matches optimistic updates, and tracks unread counts', async () => {
  const mockSignaling = new MockSignalingClient();
  let sentPayload = null;

  mockSignaling.request = async (event, payload) => {
    if (event === 'room:join') {
      return {
        peerId: 'self-peer',
        isHost: false,
        role: 'participant',
        peers: [],
      };
    }
    if (event === 'chat:send') {
      sentPayload = payload;
      return {
        message: {
          id: 'msg-server-123',
          from: { id: 'u1', name: 'Alice' },
          text: payload.text,
          to: payload.to ? { id: payload.to, name: 'Bob' } : undefined,
          replyTo: payload.replyTo
            ? { id: payload.replyTo, text: 'Original message', fromName: 'Bob' }
            : undefined,
          createdAt: new Date().toISOString(),
        },
      };
    }
    return {};
  };

  const session = new CallSession({
    code: 'chat-plus-room',
    url: 'http://localhost:3000',
    currentUser: { id: 'u1', name: 'Alice' },
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
  });

  session.start();
  await new Promise((r) => setTimeout(r, 10));

  // 1. Send message with both 'to' and 'replyTo'
  await session.sendMessage(
    'I agree with your suggestion',
    { id: 'u2', name: 'Bob' },
    { id: 'parent-msg-1', text: 'Should we release tomorrow?', fromName: 'Bob' }
  );

  assert.equal(sentPayload.text, 'I agree with your suggestion');
  assert.equal(sentPayload.to, 'u2');
  assert.equal(sentPayload.replyTo, 'parent-msg-1');

  // Verify message delivered in session state
  const messages = session.getState().messages;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, 'msg-server-123');
  assert.equal(messages[0].status, 'delivered');
  assert.equal(messages[0].to.id, 'u2');
  assert.equal(messages[0].replyTo.id, 'parent-msg-1');
  assert.equal(messages[0].replyTo.fromName, 'Bob');

  // 2. Incoming private message when chat is closed increments unreadCount
  assert.equal(session.getState().unreadCount, 0);

  mockSignaling.emit('chat:message', {
    id: 'msg-incoming-999',
    from: { id: 'u2', name: 'Bob' },
    to: { id: 'u1', name: 'Alice' },
    text: 'A private reply to you',
    createdAt: new Date().toISOString(),
  });

  assert.equal(session.getState().unreadCount, 1);
  assert.equal(session.getState().messages.length, 2);

  // Opening chat clears unread count
  session.setChatOpen(true);
  assert.equal(session.getState().unreadCount, 0);

  session.leave();
});
