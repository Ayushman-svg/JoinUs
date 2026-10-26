import test from 'node:test';
import assert from 'node:assert/strict';

import { CallSession } from '../src/webrtc/call.js';
import {
  isSpeechRecognitionSupported,
  getCaptionsOptIn,
  setCaptionsOptIn,
  SpeechTranscriber,
} from '../src/utils/speechRecognition.js';

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
  async request(event) {
    if (event === 'room:join') {
      return {
        peerId: 'self-peer',
        isHost: true,
        role: 'host',
        peers: [],
      };
    }
    return {};
  }
}

test('Captions: CallSession handles caption:segment, distinguishes live captions from transcript', async () => {
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
      };
    }
    return { ok: true };
  };

  const session = new CallSession({
    code: 'captions-test',
    url: 'http://localhost:3000',
    currentUser: { id: 'u1', name: 'Alice' },
    getToken: () => 'token',
    createSignalingClient: () => mockSignaling,
  });

  session.start();
  await new Promise((r) => setTimeout(r, 10));

  // Verify initial state
  assert.equal(session.getState().liveCaption, null);
  assert.deepEqual(session.getState().transcript, []);

  // Send caption segment
  await session.sendCaptionSegment('Hello world', false);
  assert.equal(requestedEvent, 'caption:segment');
  assert.deepEqual(requestedPayload, { text: 'Hello world', final: false });

  // 1. Receive interim segment: live caption updates, transcript stays empty
  mockSignaling.emit('caption:segment', {
    peerId: 'peer-alice',
    userId: 'u1',
    name: 'Alice',
    text: 'Hello world interim',
    final: false,
    timestamp: 1000,
    offsetMs: 1500,
  });

  let state = session.getState();
  assert.ok(state.liveCaption);
  assert.equal(state.liveCaption.text, 'Hello world interim');
  assert.equal(state.liveCaption.final, false);
  assert.equal(state.liveCaption.name, 'Alice');
  assert.deepEqual(state.transcript, []);

  // 2. Receive final segment: live caption updates and transcript appends
  mockSignaling.emit('caption:segment', {
    peerId: 'peer-alice',
    userId: 'u1',
    name: 'Alice',
    text: 'Hello world completed sentence.',
    final: true,
    timestamp: 2000,
    offsetMs: 2500,
  });

  state = session.getState();
  assert.ok(state.liveCaption);
  assert.equal(state.liveCaption.text, 'Hello world completed sentence.');
  assert.equal(state.liveCaption.final, true);
  assert.equal(state.transcript.length, 1);
  assert.equal(state.transcript[0].text, 'Hello world completed sentence.');
  assert.equal(state.transcript[0].name, 'Alice');
  assert.equal(state.transcript[0].offsetMs, 2500);

  session.leave();
});

test('Captions: Speech recognition utility and transcriber lifecycle', () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  assert.equal(getCaptionsOptIn(), false);
  setCaptionsOptIn(true);
  assert.equal(getCaptionsOptIn(), true);
  setCaptionsOptIn(false);
  assert.equal(getCaptionsOptIn(), false);

  // Feature detection
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  assert.equal(isSpeechRecognitionSupported(), false);

  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = 'en-US';
      this.started = false;
    }
    start() {
      this.started = true;
    }
    stop() {
      this.started = false;
      this.onend?.();
    }
  }

  globalThis.SpeechRecognition = MockSpeechRecognition;
  assert.equal(isSpeechRecognitionSupported(), true);

  const segments = [];
  const transcriber = new SpeechTranscriber({
    onSegment: (seg) => segments.push(seg),
  });

  transcriber.start();
  assert.equal(transcriber.isListening, true);
  assert.equal(transcriber.recognition.continuous, true);
  assert.equal(transcriber.recognition.interimResults, true);

  // Simulate interim result
  transcriber.recognition.onresult({
    resultIndex: 0,
    results: [
      Object.assign([{ transcript: 'Testing live caption' }], { isFinal: false }),
    ],
  });
  assert.equal(segments.length, 1);
  assert.deepEqual(segments[0], { text: 'Testing live caption', final: false });

  // Simulate final result
  transcriber.recognition.onresult({
    resultIndex: 1,
    results: [
      Object.assign([{ transcript: 'Testing live caption' }], { isFinal: false }),
      Object.assign([{ transcript: 'Testing live caption complete.' }], { isFinal: true }),
    ],
  });
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[1], { text: 'Testing live caption complete.', final: true });

  transcriber.stop();
  assert.equal(transcriber.isListening, false);
});
