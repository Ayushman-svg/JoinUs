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
import { getMeetingMessages } from '../api/meetings.js';
import { AudioActivityTracker } from './audioActivity.js';

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
    currentUser = null,
    localStream = null,
    // Returns { audio, video }: whether our microphone and camera are on right now
    getLocalMedia = () => ({ audio: true, video: true }),
    rtcConfig = DEFAULT_RTC_CONFIG,
    createSignalingClient = createSignaling,
    getMeetingMessagesApi = getMeetingMessages,
    passcode = null,
    onMuteDirective = null,
    onStopVideoDirective = null,
    onRequestUnmute = null,
  }) {
    this.code = code;
    this.url = url;
    this.getToken = getToken;
    this.currentUser = currentUser;
    this.localStream = localStream;
    this.getLocalMedia = getLocalMedia;
    this.rtcConfig = rtcConfig;
    this.createSignalingClient = createSignalingClient;
    this.getMeetingMessagesApi = getMeetingMessagesApi;
    this.passcode = passcode;
    this.onMuteDirective = onMuteDirective;
    this.onStopVideoDirective = onStopVideoDirective;
    this.onRequestUnmute = onRequestUnmute;

    this.listeners = new Set();
    this.signaling = null;
    this.unsubscribe = [];
    this.peers = new Map(); // peerId -> { peer, user, stream, connectionState }
    this.pending = new Map(); // peerId -> signals that arrived before the peer was announced
    this.earlyPeers = [];
    this.waitingList = [];
    this.hostInRoom = true;
    this.isHost = false;
    this.isCoHost = false;
    this.role = 'participant';
    this.canModerate = false;
    this.roomSettings = {
      muteOnEntry: false,
      chatAllowed: true,
      shareAllowed: 'all',
      locked: false,
    };
    this.isLocked = false;
    this.securityToast = null;
    this.unmuteRequestPrompt = null;
    this.activePoll = null;
    this.selfId = null;
    this.screenShare = null;
    this.joinAttempt = 0;
    this.finished = false;
    this.waitingPollInterval = null;
    this.guestWaitingPollInterval = null;
    this.guestVisibilityListener = null;
    this.inCallPollInterval = null;
    this.chatSyncInterval = null;
    this.chatVisibilityListener = null;
    this.chatSyncing = false;
    this.isWaiting = false;
    this.isReconnecting = false;
    this.wakeLock = null;

    this.activeSpeaker = null;
    this.audioTracker = new AudioActivityTracker({
      onSpeakerChange: (speakerId) => {
        this.activeSpeaker = speakerId;
        this.#update({ activeSpeaker: speakerId });
      },
    });

    this.messages = [];
    this.unreadCount = 0;
    this.isChatOpen = false;
    this.historyLoading = false;
    this.historyLoaded = false;
    this.historyError = null;
    this.rateLimitHint = null;

    this.peerToast = null;
    this.handToast = null;
    this.reactions = [];
    this.selfHandRaised = false;
    this.selfRaisedAt = null;
    this.selfFeedback = null;
    this.liveCaption = null;
    this.transcript = [];
    this.captionFadeTimer = null;

    this.state = {
      status: CallStatus.CONNECTING,
      error: null,
      selfId: null,
      peers: [],
      screenShare: null,
      screenStream: null,
      activeSpeaker: null,
      waitingList: [],
      hostInRoom: true,
      isHost: false,
      isCoHost: false,
      role: 'participant',
      canModerate: false,
      roomSettings: {
        muteOnEntry: false,
        chatAllowed: true,
        shareAllowed: 'all',
        locked: false,
      },
      isLocked: false,
      securityToast: null,
      unmuteRequestPrompt: null,
      messages: [],
      unreadCount: 0,
      historyLoading: false,
      historyError: null,
      rateLimitHint: null,
      peerToast: null,
      handToast: null,
      reactions: [],
      selfHandRaised: false,
      selfRaisedAt: null,
      selfFeedback: null,
      activePoll: null,
      liveCaption: null,
      transcript: [],
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

    if (this.localStream) {
      this.audioTracker?.trackStream('local', this.localStream);
    }

    const signaling = this.createSignalingClient({ url: this.url, getToken: this.getToken });
    this.signaling = signaling;
    this.unsubscribe = [
      signaling.on('status', (event) => this.#onSignalingStatus(event)),
      // Someone joined after us: they make the first offer
      signaling.on('room:peer-joined', (info) => {
        const name = info.user?.name ?? 'Someone';
        this.peerToast = { message: `${name} joined`, id: `${Date.now()}-${Math.random()}` };
        this.#update({ peerToast: this.peerToast });
        this.#addPeer(info, { initiator: false });
      }),
      signaling.on('room:peer-left', ({ peerId }) => {
        const existing = this.peers.get(peerId);
        const name = existing?.user?.name ?? 'Someone';
        this.peerToast = { message: `${name} left`, id: `${Date.now()}-${Math.random()}` };
        this.#update({ peerToast: this.peerToast });
        this.#removePeer(peerId);
      }),
      signaling.on('room:peer-updated', (update) => this.#updatePeerMedia(update)),
      signaling.on('room:screen-updated', (screen) => this.#onScreenUpdated(screen)),
      signaling.on('room:kicked', ({ reason }) => this.#finish(CallStatus.KICKED, { reason })),
      signaling.on('room:waiting-updated', ({ waiting }) => this.#onWaitingUpdated(waiting)),
      signaling.on('room:admitted', (data) => this.#onAdmitted(data)),
      signaling.on('room:denied', () => {
        this.isWaiting = false;
        this.#releaseWakeLock();
        this.#finish(CallStatus.DENIED);
      }),
      signaling.on('room:removed', ({ reason } = {}) =>
        this.#finish(CallStatus.REMOVED, { reason: reason || 'REMOVED_BY_HOST' })
      ),
      signaling.on('room:ended', () => this.#finish(CallStatus.ENDED)),
      signaling.on('room:locked', ({ locked }) => {
        this.isLocked = Boolean(locked);
        this.roomSettings = { ...this.roomSettings, locked: Boolean(locked) };
        this.securityToast = {
          message: locked ? 'This meeting is now locked' : 'This meeting is now unlocked',
          id: `${Date.now()}-${Math.random()}`,
        };
        this.#update({
          isLocked: this.isLocked,
          roomSettings: this.roomSettings,
          securityToast: this.securityToast,
        });
      }),
      signaling.on('room:settings-changed', ({ settings }) => {
        if (!settings) return;
        this.roomSettings = { ...this.roomSettings, ...settings };
        if (settings.locked !== undefined) {
          this.isLocked = Boolean(settings.locked);
        }
        this.#update({
          roomSettings: this.roomSettings,
          isLocked: this.isLocked,
        });
      }),
      signaling.on('peer:role-changed', ({ peerId, userId, role, isCoHost }) => {
        const isSelf =
          peerId === this.selfId ||
          (this.currentUser?.id && String(userId) === String(this.currentUser.id));
        if (isSelf) {
          this.role = role;
          this.isCoHost = Boolean(isCoHost);
          this.canModerate = this.isHost || this.isCoHost;
          this.securityToast = {
            message:
              role === 'co-host' ? 'You were made a co-host' : 'You are no longer a co-host',
            id: `${Date.now()}-${Math.random()}`,
          };
          this.#update({
            role: this.role,
            isCoHost: this.isCoHost,
            canModerate: this.canModerate,
            securityToast: this.securityToast,
          });
        }
        const entry = this.peers.get(peerId);
        if (entry) {
          entry.role = role;
          entry.isCoHost = Boolean(isCoHost);
          entry.isHost = role === 'host';
          this.#update();
        }
      }),
      signaling.on('peer:renamed', ({ peerId, userId, name }) => {
        const isSelf =
          peerId === this.selfId ||
          (this.currentUser?.id && String(userId) === String(this.currentUser.id));
        if (isSelf) {
          if (this.currentUser) {
            this.currentUser.name = name;
          }
          this.securityToast = {
            message: `You were renamed to ${name}`,
            id: `${Date.now()}-${Math.random()}`,
          };
          this.#update({ securityToast: this.securityToast });
        }
        const entry = this.peers.get(peerId);
        if (entry) {
          entry.user = { ...(entry.user || {}), name };
          this.#update();
        }
      }),
      signaling.on('host:command-mute', ({ by }) => {
        this.securityToast = {
          message: `${by || 'The host'} muted your microphone`,
          id: `${Date.now()}-${Math.random()}`,
          type: 'warning',
        };
        this.#update({ securityToast: this.securityToast });
        this.onMuteDirective?.();
      }),
      signaling.on('host:command-stop-video', ({ by }) => {
        this.securityToast = {
          message: `${by || 'The host'} stopped your camera`,
          id: `${Date.now()}-${Math.random()}`,
          type: 'warning',
        };
        this.#update({ securityToast: this.securityToast });
        this.onStopVideoDirective?.();
      }),
      signaling.on('host:command-request-unmute', ({ by }) => {
        this.unmuteRequestPrompt = {
          by: by || 'The host',
          id: `${Date.now()}-${Math.random()}`,
        };
        this.#update({ unmuteRequestPrompt: this.unmuteRequestPrompt });
        this.onRequestUnmute?.({ by });
      }),
      signaling.on('chat:message', (message) => this.#onChatMessage(message)),
      signaling.on('reaction:new', (reaction) => this.#onReactionNew(reaction)),
      signaling.on('hand:changed', (data) => this.#onHandChanged(data)),
      signaling.on('feedback:changed', (data) => this.#onFeedbackChanged(data)),
      signaling.on('poll:launched', ({ poll }) => {
        this.activePoll = poll;
        this.#update({ activePoll: this.activePoll });
      }),
      signaling.on('poll:updated', ({ poll }) => {
        if (this.activePoll && this.activePoll.id === poll?.id) {
          this.activePoll = { ...this.activePoll, ...poll };
        } else {
          this.activePoll = poll;
        }
        this.#update({ activePoll: this.activePoll });
      }),
      signaling.on('poll:closed', ({ poll }) => {
        if (this.activePoll && this.activePoll.id === poll?.id) {
          this.activePoll = { ...this.activePoll, ...poll, status: 'closed' };
        } else {
          this.activePoll = poll;
        }
        this.#update({ activePoll: this.activePoll });
      }),
      signaling.on('caption:segment', (segment) => this.#onCaptionSegment(segment)),
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

  async removePeer(peerId, block = false) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:remove', { peerId, block: Boolean(block) });
  }

  async lockMeeting(locked = true) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const res = await this.signaling.request('host:lock', { locked: Boolean(locked) });
    this.isLocked = Boolean(locked);
    this.roomSettings = { ...this.roomSettings, locked: Boolean(locked) };
    this.#update({ isLocked: this.isLocked, roomSettings: this.roomSettings });
    return res;
  }

  async updateRoomSettings(settings) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const res = await this.signaling.request('host:settings', { settings });
    if (res?.settings) {
      this.roomSettings = res.settings;
      if (res.settings.locked !== undefined) {
        this.isLocked = Boolean(res.settings.locked);
      }
      this.#update({ roomSettings: this.roomSettings, isLocked: this.isLocked });
    }
    return res;
  }

  async promoteCoHost(peerId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:promote', { peerId });
  }

  async demoteCoHost(peerId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:demote', { peerId });
  }

  async mutePeer(peerId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:mute', { peerId });
  }

  async muteAllPeers() {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:mute-all', {});
  }

  async requestUnmute(peerId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:request-unmute', { peerId });
  }

  async stopPeerVideo(peerId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:stop-video', { peerId });
  }

  async renamePeer(peerId, name) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:rename', { peerId, name });
  }

  dismissUnmuteRequest() {
    this.unmuteRequestPrompt = null;
    this.#update({ unmuteRequestPrompt: null });
  }

  clearSecurityToast() {
    this.securityToast = null;
    this.#update({ securityToast: null });
  }

  async endMeeting() {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const res = await this.signaling.request('host:end', {});
    this.#finish(CallStatus.ENDED);
    return res;
  }

  async createPoll(payload) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const res = await this.signaling.request('poll:create', payload);
    if (res?.poll && payload?.launchNow) {
      this.activePoll = res.poll;
      this.#update({ activePoll: this.activePoll });
    }
    return res?.poll;
  }

  async launchPoll(pollId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const res = await this.signaling.request('poll:launch', { pollId });
    if (res?.poll) {
      this.activePoll = res.poll;
      this.#update({ activePoll: this.activePoll });
    }
    return res?.poll;
  }

  async closePoll(pollId) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const res = await this.signaling.request('poll:close', { pollId });
    if (res?.poll) {
      this.activePoll = res.poll;
      this.#update({ activePoll: this.activePoll });
    }
    return res?.poll;
  }

  async submitVote(pollId, optionIds) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const res = await this.signaling.request('poll:vote', { pollId, optionIds });
    if (res?.poll) {
      this.activePoll = res.poll;
      this.#update({ activePoll: this.activePoll });
    }
    return res?.poll;
  }

  dismissActivePoll() {
    this.activePoll = null;
    this.#update({ activePoll: null });
  }

  async sendCaptionSegment(text, final = false) {
    if (!this.signaling?.connected || !text || !text.trim()) return;
    return this.signaling.request('caption:segment', {
      text: text.trim().slice(0, 300),
      final: Boolean(final),
    });
  }

  #onCaptionSegment(segment) {
    if (this.finished || !segment || !segment.text) return;

    this.liveCaption = {
      peerId: segment.peerId,
      userId: segment.userId,
      name: segment.name || 'Speaker',
      text: segment.text,
      final: Boolean(segment.final),
      timestamp: segment.timestamp || Date.now(),
      offsetMs: segment.offsetMs || 0,
    };

    if (segment.final) {
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        peerId: segment.peerId,
        userId: segment.userId,
        name: segment.name || 'Speaker',
        text: segment.text,
        offsetMs: segment.offsetMs || 0,
        timestamp: segment.timestamp || Date.now(),
        final: true,
      };
      this.transcript = [...this.transcript, item];
    }

    if (this.captionFadeTimer) {
      clearTimeout(this.captionFadeTimer);
    }
    this.captionFadeTimer = setTimeout(() => {
      this.liveCaption = null;
      this.#update({ liveCaption: null });
    }, 5000);

    this.#update({ liveCaption: this.liveCaption, transcript: this.transcript });
  }

  async refreshWaitingList() {
    if (this.finished || !this.canModerate || !this.signaling?.connected) return;
    try {
      const res = await this.signaling.request('host:list-waiting', { code: this.code });
      if (this.finished) return;
      if (Array.isArray(res?.waiting)) {
        this.waitingList = res.waiting;
        this.#update({ waitingList: this.waitingList });
      }
    } catch {
      /* ignore */
    }
  }

  #startWaitingPolling() {
    if (this.waitingPollInterval) return;
    this.waitingPollInterval = setInterval(() => {
      if (this.finished || !this.canModerate || !this.signaling?.connected) return;
      if (this.peers.size === 0 || this.waitingList.length > 0) {
        this.refreshWaitingList();
      }
    }, 5000);
  }

  #stopWaitingPolling() {
    if (this.waitingPollInterval) {
      clearInterval(this.waitingPollInterval);
      this.waitingPollInterval = null;
    }
  }

  async #pollGuestStatus() {
    if (this.finished || !this.isWaiting || !this.signaling?.connected) return;
    try {
      const res = await this.signaling.request('room:status', { code: this.code });
      if (this.finished || !this.isWaiting) return;

      if (res?.status === 'admitted') {
        this.#stopGuestWaitingPolling();
        this.#onAdmitted({
          peerId: res.peerId || this.selfId || this.signaling?.id,
          peers: res.peers || [],
          screenSharer: res.screenSharer,
          role: res.role,
          isHost: res.isHost,
          isCoHost: res.isCoHost,
          settings: res.settings,
          locked: res.locked,
          activePoll: res.activePoll,
        });
      } else if (res?.status === 'ended') {
        this.#stopGuestWaitingPolling();
        this.#finish(CallStatus.ENDED);
      } else if (res?.status === 'denied') {
        this.#stopGuestWaitingPolling();
        this.isWaiting = false;
        this.#releaseWakeLock();
        this.#finish(CallStatus.DENIED);
      } else if (res?.status === 'removed') {
        this.#stopGuestWaitingPolling();
        this.#finish(CallStatus.REMOVED, { reason: 'REMOVED_BY_HOST' });
      }
    } catch (err) {
      if (err?.code === 'MEETING_ENDED') {
        this.#stopGuestWaitingPolling();
        this.#finish(CallStatus.ENDED);
      }
    }
  }

  #startGuestWaitingPolling() {
    this.#stopGuestWaitingPolling();

    this.guestWaitingPollInterval = setInterval(() => {
      this.#pollGuestStatus();
    }, 3000);

    this.guestVisibilityListener = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        this.#pollGuestStatus();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.guestVisibilityListener);
    }
  }

  #stopGuestWaitingPolling() {
    if (this.guestWaitingPollInterval) {
      clearInterval(this.guestWaitingPollInterval);
      this.guestWaitingPollInterval = null;
    }
    if (this.guestVisibilityListener) {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.guestVisibilityListener);
      }
      this.guestVisibilityListener = null;
    }
  }

  #startInCallPolling() {
    this.#stopInCallPolling();
    if (this.isHost) return;

    this.inCallPollInterval = setInterval(async () => {
      if (this.finished || this.state.status !== CallStatus.ACTIVE || !this.signaling?.connected) {
        return;
      }
      try {
        const res = await this.signaling.request('room:status', { code: this.code });
        if (this.finished) return;
        if (res?.status === 'ended') {
          this.#stopInCallPolling();
          this.#finish(CallStatus.ENDED);
        } else if (res?.status === 'removed') {
          this.#stopInCallPolling();
          this.#finish(CallStatus.REMOVED, { reason: 'REMOVED_BY_HOST' });
        } else if (res?.activePoll !== undefined) {
          if (JSON.stringify(this.activePoll) !== JSON.stringify(res.activePoll)) {
            this.activePoll = res.activePoll;
            this.#update({ activePoll: this.activePoll });
          }
        }
      } catch (err) {
        if (err?.code === 'MEETING_ENDED') {
          this.#stopInCallPolling();
          this.#finish(CallStatus.ENDED);
        }
      }
    }, 10000);
  }

  #stopInCallPolling() {
    if (this.inCallPollInterval) {
      clearInterval(this.inCallPollInterval);
      this.inCallPollInterval = null;
    }
  }

  #startChatSync() {
    this.#stopChatSync();

    this.chatSyncInterval = setInterval(() => {
      this.syncChat();
    }, 4000);

    this.chatVisibilityListener = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        this.syncChat();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.chatVisibilityListener);
    }
  }

  #stopChatSync() {
    if (this.chatSyncInterval) {
      clearInterval(this.chatSyncInterval);
      this.chatSyncInterval = null;
    }
    if (this.chatVisibilityListener) {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.chatVisibilityListener);
      }
      this.chatVisibilityListener = null;
    }
  }

  #getLastMessageId() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m && m.id && !m.isSystem && !m.tempId && m.status !== 'sending' && m.status !== 'failed') {
        return m.id;
      }
    }
    return null;
  }

  async syncChat() {
    if (this.finished || this.state.status !== CallStatus.ACTIVE) return;
    if (this.chatSyncing) return;
    this.chatSyncing = true;
    try {
      const lastId = this.#getLastMessageId();
      if (!this.historyLoaded && !lastId) return;

      const options = lastId ? { after: lastId } : {};
      const newMessages = await this.getMeetingMessagesApi(this.code, 100, options);
      if (this.finished || this.state.status !== CallStatus.ACTIVE) return;
      if (Array.isArray(newMessages) && newMessages.length > 0) {
        this.#mergeIncomingMessages(newMessages);
      }
    } catch {
      // Background sync errors are ignored
    } finally {
      this.chatSyncing = false;
    }
  }

  #mergeIncomingMessages(incoming = []) {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    let changed = false;
    let nextMessages = [...this.messages];

    for (const msg of incoming) {
      if (!msg || !msg.id) continue;
      const existingIdx = nextMessages.findIndex((m) => m.id === msg.id);
      if (existingIdx !== -1) {
        if (nextMessages[existingIdx].status !== 'delivered') {
          nextMessages[existingIdx] = { ...nextMessages[existingIdx], ...msg, status: 'delivered' };
          changed = true;
        }
        continue;
      }

      const isSelf = this.currentUser?.id && String(msg.from?.id) === String(this.currentUser.id);
      let matchedOpt = false;
      if (isSelf) {
        const optIdx = nextMessages.findIndex(
          (m) => (m.status === 'sending' || m.status === 'failed') && m.text === msg.text
        );
        if (optIdx !== -1) {
          nextMessages[optIdx] = { ...msg, status: 'delivered' };
          matchedOpt = true;
          changed = true;
        }
      }

      if (!matchedOpt) {
        const deliveredMsg = { ...msg, status: 'delivered' };
        const msgTime = new Date(deliveredMsg.createdAt).getTime();
        let insertIdx = nextMessages.length;
        for (let i = nextMessages.length - 1; i >= 0; i--) {
          const item = nextMessages[i];
          if (item.status === 'sending' || item.status === 'failed') {
            insertIdx = i;
          } else {
            const itemTime = new Date(item.createdAt).getTime();
            if (msgTime >= itemTime) {
              insertIdx = i + 1;
              break;
            }
          }
        }
        nextMessages.splice(insertIdx, 0, deliveredMsg);
        if (!isSelf && !this.isChatOpen) {
          this.unreadCount += 1;
        }
        changed = true;
      }
    }

    if (changed) {
      this.messages = nextMessages;
      this.#update({ messages: this.messages, unreadCount: this.unreadCount });
    }
  }

  async #acquireWakeLock() {
    if (this.wakeLock || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      this.wakeLock = lock;
      lock?.addEventListener?.('release', () => {
        if (this.wakeLock === lock) {
          this.wakeLock = null;
        }
      });
    } catch {
      // feature-detected, failures ignored
    }
  }

  async #releaseWakeLock() {
    if (!this.wakeLock) return;
    const lock = this.wakeLock;
    this.wakeLock = null;
    try {
      await lock.release?.();
    } catch {
      // failures ignored
    }
  }

  async startScreenShare() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing is not supported by your browser');
    }
    if (this.localScreenStream) return;
    if (this.screenShare && this.screenShare.peerId !== this.selfId) {
      const err = new Error('Someone else is already sharing');
      err.code = 'SCREEN_SHARE_BUSY';
      throw err;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (err) {
      // User cancelled browser screen picker: not an error
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        return;
      }
      throw err;
    }

    if (this.finished || this.state.status !== CallStatus.ACTIVE) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    try {
      await this.signaling.request('share:start', { streamId: stream.id });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw err;
    }

    this.localScreenStream = stream;
    this.screenShare = { peerId: this.selfId, streamId: stream.id };

    // Handle user clicking native browser "Stop sharing" chrome
    stream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        this.stopScreenShare();
      };
    });

    // Add screen tracks to all active peer connections
    for (const entry of this.peers.values()) {
      stream.getTracks().forEach((track) => {
        entry.peer.addTrack(track, stream);
      });
    }

    this.#update({ screenShare: this.screenShare });
  }

  stopScreenShare() {
    if (!this.localScreenStream) return;
    const stream = this.localScreenStream;
    this.localScreenStream = null;

    stream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });

    for (const entry of this.peers.values()) {
      const senders = entry.peer.getSenders();
      for (const sender of senders) {
        if (sender.track && stream.getTracks().includes(sender.track)) {
          entry.peer.removeTrack(sender);
        }
      }
    }

    if (this.signaling?.connected) {
      this.signaling.send('share:stop', {});
    }

    if (this.screenShare?.peerId === this.selfId) {
      this.screenShare = null;
    }

    this.#update({ screenShare: this.screenShare });
  }

  async stopHostScreenShare() {
    if (!this.signaling?.connected) throw new Error('Not connected');
    return this.signaling.request('host:stop-share', {});
  }

  // Screen share and track management methods
  async sendReaction(kind) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const ack = await this.signaling.request('reaction:send', { kind });
    if (ack && ack.ok !== false) {
      this.#onReactionNew({
        kind,
        peerId: this.selfId,
        userId: this.currentUser?.id,
        name: this.currentUser?.name,
      });
    }
    return ack;
  }

  async setHandRaised(raised, peerId = null) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const payload = { raised: Boolean(raised) };
    if (peerId) payload.peerId = peerId;
    const ack = await this.signaling.request('hand:set', payload);
    if (!peerId || peerId === this.selfId) {
      this.selfHandRaised = Boolean(raised);
      this.selfRaisedAt = raised ? Date.now() : null;
      this.#update({ selfHandRaised: this.selfHandRaised, selfRaisedAt: this.selfRaisedAt });
    } else {
      const entry = this.peers.get(peerId);
      if (entry) {
        entry.handRaised = Boolean(raised);
        entry.raisedAt = raised ? Date.now() : null;
        this.#update();
      }
    }
    return ack;
  }

  async setFeedback(kind) {
    if (!this.signaling?.connected) throw new Error('Not connected');
    const ack = await this.signaling.request('feedback:set', { kind: kind || null });
    this.selfFeedback = kind || null;
    this.#update({ selfFeedback: this.selfFeedback });
    return ack;
  }

  async lowerPeerHand(peerId) {
    return this.setHandRaised(false, peerId);
  }

  #onReactionNew(reaction) {
    if (this.finished || !reaction) return;
    const item = {
      id: `${Date.now()}-${Math.random()}`,
      kind: reaction.kind,
      peerId: reaction.peerId,
      userId: reaction.userId,
      name: reaction.name || 'Participant',
      timestamp: reaction.timestamp || Date.now(),
      leftPercent: 15 + Math.floor(Math.random() * 70),
    };
    const updated = [...this.reactions, item].slice(-8);
    this.reactions = updated;
    this.#update({ reactions: this.reactions });
  }

  #onHandChanged({ peerId, userId, name, raised, raisedAt }) {
    if (this.finished) return;
    const isSelf = peerId === this.selfId || (this.currentUser?.id && String(userId) === String(this.currentUser.id));
    if (isSelf) {
      this.selfHandRaised = Boolean(raised);
      this.selfRaisedAt = raised ? (raisedAt || Date.now()) : null;
    }

    const entry = this.peers.get(peerId);
    if (entry) {
      entry.handRaised = Boolean(raised);
      entry.raisedAt = raised ? (raisedAt || Date.now()) : null;
    }

    // Host toast: '<name> raised a hand'
    if (raised && this.isHost && !isSelf) {
      this.handToast = {
        id: `${Date.now()}-${Math.random()}`,
        message: `${name || 'Someone'} raised a hand`,
        peerId,
      };
    }

    this.#update({
      selfHandRaised: this.selfHandRaised,
      selfRaisedAt: this.selfRaisedAt,
      handToast: this.handToast,
    });
  }

  #onFeedbackChanged({ peerId, userId, name, kind }) {
    if (this.finished) return;
    const isSelf = peerId === this.selfId || (this.currentUser?.id && String(userId) === String(this.currentUser.id));
    if (isSelf) {
      this.selfFeedback = kind || null;
    }

    const entry = this.peers.get(peerId);
    if (entry) {
      entry.feedback = kind || null;
    }

    this.#update({ selfFeedback: this.selfFeedback });
  }

  // Replaces the outgoing track across all active peer connections without renegotiation
  async replaceTrack(kind, newTrack) {
    if (this.finished) return;
    for (const entry of this.peers.values()) {
      if (!entry.peer || entry.peer.closed) continue;
      const senders = entry.peer.getSenders();
      for (const sender of senders) {
        if (sender.track && sender.track.kind === kind) {
          // Do not replace screen share video track
          if (
            kind === 'video' &&
            this.localScreenStream?.getVideoTracks()?.includes(sender.track)
          ) {
            continue;
          }
          try {
            await sender.replaceTrack(newTrack);
          } catch {
            /* ignore sender error */
          }
        }
      }
    }
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
    this.isWaiting = false;
    this.#releaseWakeLock();
    this.#stopWaitingPolling();
    this.#stopGuestWaitingPolling();
    this.#stopInCallPolling();
    this.#stopChatSync();
    this.stopScreenShare();
    if (this.signaling?.connected) this.signaling.send('room:leave');
    this.#finish(CallStatus.LEFT);
  }

  #onSignalingStatus({ status, error }) {
    if (this.finished) return;

    if (status === SignalingStatus.CONNECTING) {
      this.#update({ status: CallStatus.CONNECTING });
    } else if (status === SignalingStatus.CONNECTED) {
      this.#join();
      if (this.isHost) {
        this.refreshWaitingList();
      }
      if (this.isWaiting) {
        this.#pollGuestStatus();
      }
    } else if (status === SignalingStatus.RECONNECTING) {
      this.joinAttempt += 1; // forget a join that was still waiting for its answer
      this.#stopInCallPolling();
      this.#stopChatSync();
      this.#closePeers();
      this.selfId = null;
      if (this.isWaiting) {
        this.#update({ isReconnecting: true });
      } else {
        this.#update({ status: CallStatus.RECONNECTING, selfId: null, isReconnecting: true });
      }
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
      const payload = {
        code: this.code,
        ...this.getLocalMedia(),
      };
      if (this.passcode) {
        payload.passcode = this.passcode;
      }
      const response = await this.signaling.request('room:join', payload);
      if (this.finished || attempt !== this.joinAttempt) return;

      if (response.status === 'waiting') {
        this.selfId = null;
        this.hostInRoom = response.hostInRoom !== false;
        this.isWaiting = true;
        if (response.settings) this.roomSettings = response.settings;
        this.isLocked = Boolean(response.locked || this.roomSettings?.locked);
        this.#acquireWakeLock();
        this.#update({
          status: CallStatus.WAITING,
          selfId: null,
          hostInRoom: this.hostInRoom,
          isReconnecting: false,
          roomSettings: this.roomSettings,
          isLocked: this.isLocked,
        });
        this.#startGuestWaitingPolling();
        return;
      }

      this.isWaiting = false;
      this.#stopGuestWaitingPolling();
      this.#releaseWakeLock();
      this.selfId = response.peerId;
      this.role =
        response.role ||
        (response.isHost ? 'host' : response.isCoHost ? 'co-host' : 'participant');
      this.isHost = Boolean(response.isHost || this.role === 'host');
      this.isCoHost = Boolean(response.isCoHost || this.role === 'co-host');
      this.canModerate = this.isHost || this.isCoHost;
      if (response.settings) this.roomSettings = response.settings;
      this.isLocked = Boolean(response.locked || this.roomSettings?.locked);
      this.screenShare = response.screenSharer ?? null;
      this.selfHandRaised = Boolean(response.handRaised);
      this.selfRaisedAt = response.raisedAt || null;
      this.selfFeedback = response.feedback || null;
      if (response.activePoll !== undefined) {
        this.activePoll = response.activePoll;
      }
      this.#update({
        status: CallStatus.ACTIVE,
        selfId: this.selfId,
        isHost: this.isHost,
        isCoHost: this.isCoHost,
        role: this.role,
        canModerate: this.canModerate,
        roomSettings: this.roomSettings,
        isLocked: this.isLocked,
        screenShare: this.screenShare,
        isReconnecting: false,
        selfHandRaised: this.selfHandRaised,
        selfRaisedAt: this.selfRaisedAt,
        selfFeedback: this.selfFeedback,
        activePoll: this.activePoll,
      });
      if (!this.historyLoaded) {
        this.loadHistory();
      } else {
        this.syncChat();
      }
      this.#startChatSync();
      if (this.canModerate) {
        this.refreshWaitingList();
        this.#startWaitingPolling();
      } else {
        this.#startInCallPolling();
      }

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

  #onScreenUpdated(screen) {
    if (this.finished) return;
    this.screenShare = screen && screen.peerId && screen.streamId ? screen : null;
    this.#update({ screenShare: this.screenShare });
  }

  #onWaitingUpdated(waiting) {
    if (this.finished) return;
    this.waitingList = Array.isArray(waiting) ? waiting : [];
    this.#update({ waitingList: this.waitingList });
  }

  #onAdmitted({ peerId, peers, screenSharer, role, isCoHost, isHost, settings, locked, activePoll }) {
    if (this.finished) return;
    if (this.state.status === CallStatus.ACTIVE && this.selfId) return;
    this.isWaiting = false;
    this.#stopGuestWaitingPolling();
    this.#releaseWakeLock();
    this.selfId = peerId;
    if (role) this.role = role;
    if (isHost !== undefined) this.isHost = Boolean(isHost || this.role === 'host');
    if (isCoHost !== undefined) this.isCoHost = Boolean(isCoHost || this.role === 'co-host');
    this.canModerate = this.isHost || this.isCoHost;
    if (settings) this.roomSettings = settings;
    if (locked !== undefined) this.isLocked = Boolean(locked || this.roomSettings?.locked);
    this.screenShare = screenSharer ?? null;
    if (activePoll !== undefined) this.activePoll = activePoll;
    this.#update({
      status: CallStatus.ACTIVE,
      selfId: this.selfId,
      isHost: this.isHost,
      isCoHost: this.isCoHost,
      role: this.role,
      canModerate: this.canModerate,
      roomSettings: this.roomSettings,
      isLocked: this.isLocked,
      screenShare: this.screenShare,
      activePoll: this.activePoll,
      isReconnecting: false,
    });
    this.updateLocalMedia();
    if (!this.historyLoaded) {
      this.loadHistory();
    } else {
      this.syncChat();
    }
    this.#startChatSync();
    if (this.canModerate) {
      this.refreshWaitingList();
      this.#startWaitingPolling();
    } else {
      this.#startInCallPolling();
    }

    const waiting = this.earlyPeers;
    this.earlyPeers = [];
    for (const info of peers || []) this.#addPeer(info, { initiator: true });
    for (const info of waiting) this.#addPeer(info, { initiator: false });
  }

  #addPeer(
    {
      peerId,
      user,
      isHost = false,
      isCoHost = false,
      role = 'participant',
      audio = true,
      video = true,
      handRaised = false,
      raisedAt = null,
      feedback = null,
    },
    { initiator }
  ) {
    if (this.finished || this.peers.has(peerId)) return;
    if (!this.selfId) {
      this.earlyPeers.push({
        peerId,
        user,
        isHost,
        isCoHost,
        role,
        audio,
        video,
        handRaised,
        raisedAt,
        feedback,
      });
      return;
    }

    const hostBool = Boolean(isHost || user?.isHost || role === 'host');
    const coHostBool = Boolean(isCoHost || user?.isCoHost || role === 'co-host');
    const peerRole = role || (hostBool ? 'host' : coHostBool ? 'co-host' : 'participant');

    const entry = {
      peer: null,
      user,
      isHost: hostBool,
      isCoHost: coHostBool,
      role: peerRole,
      stream: null,
      remoteStreams: new Map(),
      connectionState: 'new',
      audio,
      video,
      handRaised: Boolean(handRaised),
      raisedAt: raisedAt || null,
      feedback: feedback || null,
    };
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
        this.audioTracker?.trackStream(peerId, stream);
        this.#update();
      },
      onTrack: ({ track, stream }) => {
        let s = entry.remoteStreams.get(stream.id);
        if (!s) {
          s = stream;
          entry.remoteStreams.set(stream.id, s);
        } else if (!s.getTracks().includes(track)) {
          s.addTrack(track);
        }
        this.#update();
      },
      onConnectionState: (connectionState) => {
        entry.connectionState = connectionState;
        this.#update();
      },
      onError: (err) => console.warn(`Peer ${peerId}: ${err.code}`, err.cause ?? err.message),
    });
    this.peers.set(peerId, entry);

    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((track) => {
        entry.peer.addTrack(track, this.localScreenStream);
      });
    }

    this.#update();

    this.#replayPending(peerId, entry.peer);
  }

  #updatePeerMedia({ peerId, audio, video, handRaised, raisedAt, feedback }) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    if (audio !== undefined) entry.audio = audio;
    if (video !== undefined) entry.video = video;
    if (handRaised !== undefined) entry.handRaised = handRaised;
    if (raisedAt !== undefined) entry.raisedAt = raisedAt;
    if (feedback !== undefined) entry.feedback = feedback;
    this.#update();
  }

  #removePeer(peerId) {
    this.pending.delete(peerId);
    this.earlyPeers = this.earlyPeers.filter((p) => p.peerId !== peerId);
    this.audioTracker?.untrackStream(peerId);
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.peer.close();
    this.peers.delete(peerId);
    if (this.screenShare?.peerId === peerId) {
      this.screenShare = null;
    }
    this.#update({ screenShare: this.screenShare });
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
    for (const peerId of this.peers.keys()) this.audioTracker?.untrackStream(peerId);
    for (const { peer } of this.peers.values()) peer.close();
    this.peers.clear();
    this.pending.clear();
    this.earlyPeers = [];
    this.screenShare = null;
  }

  // Ends the session for good with a final status
  #finish(status, extra = {}) {
    if (this.finished) return;
    this.finished = true;
    this.isWaiting = false;
    this.#releaseWakeLock();
    if (this.captionFadeTimer) {
      clearTimeout(this.captionFadeTimer);
      this.captionFadeTimer = null;
    }
    this.#stopWaitingPolling();
    this.#stopGuestWaitingPolling();
    this.#stopInCallPolling();
    this.#stopChatSync();
    this.#closePeers();
    this.audioTracker?.destroy();
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.signaling?.close();
    this.signaling = null;
    this.selfId = null;
    this.screenShare = null;
    this.#update({ status, error: null, selfId: null, screenShare: null, ...extra });
  }

  async sendMessage(rawText, to = null, replyTo = null) {
    if (!rawText || !rawText.trim()) return;
    const text = rawText.trim();
    if (text.length > 1000) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = {
      id: tempId,
      tempId,
      from: {
        id: this.currentUser?.id,
        name: this.currentUser?.name || 'You',
      },
      text,
      createdAt: new Date().toISOString(),
      status: 'sending',
    };
    if (to && to.id) {
      optimistic.to = {
        id: to.id,
        name: to.name,
      };
    }
    if (replyTo && replyTo.id) {
      optimistic.replyTo = {
        id: replyTo.id,
        text: replyTo.text,
        fromName: replyTo.fromName,
      };
    }

    this.messages = [...this.messages, optimistic];
    this.rateLimitHint = null;
    this.#update({ messages: this.messages, rateLimitHint: null });

    try {
      const payload = { text };
      if (to && to.id) {
        payload.to = to.id;
      }
      if (replyTo && replyTo.id) {
        payload.replyTo = replyTo.id;
      }
      const res = await this.signaling.request('chat:send', payload);
      const confirmed = res?.message || res;
      this.#confirmSentMessage(tempId, confirmed);
    } catch (err) {
      const isRateLimit = err?.code === 'RATE_LIMITED';
      this.messages = this.messages.map((m) =>
        m.id === tempId || m.tempId === tempId
          ? {
              ...m,
              status: 'failed',
              error: isRateLimit ? "You're sending messages too fast" : (err?.message || 'Message not sent'),
            }
          : m
      );
      if (isRateLimit) {
        this.rateLimitHint = "You're sending messages too fast";
      }
      this.#update({ messages: this.messages, rateLimitHint: this.rateLimitHint });
    }
  }

  #confirmSentMessage(tempId, confirmed) {
    if (!confirmed || !confirmed.id) return;
    const msg = { ...confirmed, status: 'delivered' };
    const existingIdx = this.messages.findIndex((m) => m.id === msg.id);
    if (existingIdx !== -1) {
      this.messages = this.messages
        .filter((m) => m.id !== tempId && m.tempId !== tempId)
        .map((m) => (m.id === msg.id ? { ...m, ...msg, status: 'delivered' } : m));
    } else {
      const tempIdx = this.messages.findIndex((m) => m.id === tempId || m.tempId === tempId);
      if (tempIdx !== -1) {
        this.messages = this.messages.map((m) =>
          m.id === tempId || m.tempId === tempId ? msg : m
        );
      } else {
        this.messages = [...this.messages, msg];
      }
    }
    this.rateLimitHint = null;
    this.#update({ messages: this.messages, rateLimitHint: null });
  }

  async retryMessage(id) {
    const target = this.messages.find((m) => m.id === id || m.tempId === id);
    if (!target || target.status !== 'failed') return;

    this.messages = this.messages.map((m) =>
      m.id === id || m.tempId === id ? { ...m, status: 'sending', error: null } : m
    );
    this.rateLimitHint = null;
    this.#update({ messages: this.messages, rateLimitHint: null });

    try {
      const payload = { text: target.text };
      if (target.to?.id) {
        payload.to = target.to.id;
      }
      if (target.replyTo?.id) {
        payload.replyTo = target.replyTo.id;
      }
      const res = await this.signaling.request('chat:send', payload);
      const confirmed = res?.message || res;
      this.#confirmSentMessage(id, confirmed);
    } catch (err) {
      const isRateLimit = err?.code === 'RATE_LIMITED';
      this.messages = this.messages.map((m) =>
        m.id === id || m.tempId === id
          ? {
              ...m,
              status: 'failed',
              error: isRateLimit ? "You're sending messages too fast" : 'Message not sent',
            }
          : m
      );
      if (isRateLimit) {
        this.rateLimitHint = "You're sending messages too fast";
      }
      this.#update({ messages: this.messages, rateLimitHint: this.rateLimitHint });
    }
  }

  clearUnread() {
    this.unreadCount = 0;
    this.#update({ unreadCount: 0 });
  }

  setChatOpen(isOpen) {
    this.isChatOpen = Boolean(isOpen);
    if (this.isChatOpen) {
      this.clearUnread();
    }
  }

  async loadHistory() {
    if (this.finished) return;
    this.historyLoading = true;
    this.historyError = null;
    this.#update({ historyLoading: true, historyError: null });

    try {
      const history = await this.getMeetingMessagesApi(this.code);
      if (this.finished) return;

      const formattedHistory = (history || []).map((m) => ({
        ...m,
        status: 'delivered',
      }));

      const historyIds = new Set(formattedHistory.map((m) => m.id));
      const unpersisted = this.messages.filter((m) => {
        if (m.isSystem) return true;
        if (m.status === 'sending' || m.status === 'failed') return true;
        return !historyIds.has(m.id);
      });

      this.messages = [...formattedHistory, ...unpersisted];
      this.historyLoading = false;
      this.historyLoaded = true;
      this.historyError = null;
      this.#update({
        messages: this.messages,
        historyLoading: false,
        historyError: null,
      });
    } catch (err) {
      if (this.finished) return;
      this.historyLoading = false;
      this.historyError = "Couldn't load earlier messages";
      this.#update({
        historyLoading: false,
        historyError: this.historyError,
      });
    }
  }

  #onChatMessage(message) {
    if (this.finished) return;
    if (!message || !message.id) return;

    // De-duplicate by id
    const existingIndex = this.messages.findIndex((m) => m.id === message.id);
    if (existingIndex !== -1) return;

    // Match own optimistic message
    const isSelf =
      this.currentUser?.id && String(message.from?.id) === String(this.currentUser.id);
    let matchedOptimistic = false;

    if (isSelf) {
      const optIndex = this.messages.findIndex(
        (m) => (m.status === 'sending' || m.status === 'failed') && m.text === message.text
      );
      if (optIndex !== -1) {
        this.messages[optIndex] = { ...message, status: 'delivered' };
        matchedOptimistic = true;
      }
    }

    if (!matchedOptimistic) {
      this.messages = [...this.messages, { ...message, status: 'delivered' }];
      if (!isSelf && !this.isChatOpen) {
        this.unreadCount += 1;
      }
    }

    this.#update({ messages: this.messages, unreadCount: this.unreadCount });
  }

  #resolveScreenStream() {
    if (!this.screenShare) return null;
    if (this.selfId && this.screenShare.peerId === this.selfId) {
      return this.localScreenStream ?? null;
    }
    const sharer = this.peers.get(this.screenShare.peerId);
    if (!sharer) return null;
    return sharer.remoteStreams?.get(this.screenShare.streamId) ?? null;
  }

  #update(patch = {}) {
    if ('waitingList' in patch) this.waitingList = patch.waitingList;
    if ('hostInRoom' in patch) this.hostInRoom = patch.hostInRoom;
    if ('isHost' in patch) this.isHost = patch.isHost;
    if ('isCoHost' in patch) this.isCoHost = patch.isCoHost;
    if ('role' in patch) this.role = patch.role;
    if ('canModerate' in patch) this.canModerate = patch.canModerate;
    if ('roomSettings' in patch) this.roomSettings = patch.roomSettings;
    if ('isLocked' in patch) this.isLocked = patch.isLocked;
    if ('securityToast' in patch) this.securityToast = patch.securityToast;
    if ('unmuteRequestPrompt' in patch) this.unmuteRequestPrompt = patch.unmuteRequestPrompt;
    if ('isReconnecting' in patch) this.isReconnecting = patch.isReconnecting;
    if ('messages' in patch) this.messages = patch.messages;
    if ('unreadCount' in patch) this.unreadCount = patch.unreadCount;
    if ('historyLoading' in patch) this.historyLoading = patch.historyLoading;
    if ('historyError' in patch) this.historyError = patch.historyError;
    if ('rateLimitHint' in patch) this.rateLimitHint = patch.rateLimitHint;
    if ('screenShare' in patch) this.screenShare = patch.screenShare;
    if ('activeSpeaker' in patch) this.activeSpeaker = patch.activeSpeaker;
    if ('peerToast' in patch) this.peerToast = patch.peerToast;
    if ('handToast' in patch) this.handToast = patch.handToast;
    if ('reactions' in patch) this.reactions = patch.reactions;
    if ('selfHandRaised' in patch) this.selfHandRaised = patch.selfHandRaised;
    if ('selfRaisedAt' in patch) this.selfRaisedAt = patch.selfRaisedAt;
    if ('selfFeedback' in patch) this.selfFeedback = patch.selfFeedback;
    if ('activePoll' in patch) this.activePoll = patch.activePoll;
    if ('liveCaption' in patch) this.liveCaption = patch.liveCaption;
    if ('transcript' in patch) this.transcript = patch.transcript;
    const activeScreen = this.#resolveScreenStream();
    this.state = {
      ...this.state,
      ...patch,
      isReconnecting: this.isReconnecting,
      waitingList: this.waitingList,
      hostInRoom: this.hostInRoom,
      isHost: this.isHost,
      isCoHost: this.isCoHost,
      role: this.role,
      canModerate: this.canModerate,
      roomSettings: this.roomSettings,
      isLocked: this.isLocked,
      securityToast: this.securityToast,
      unmuteRequestPrompt: this.unmuteRequestPrompt,
      messages: this.messages,
      unreadCount: this.unreadCount,
      historyLoading: this.historyLoading,
      historyError: this.historyError,
      rateLimitHint: this.rateLimitHint,
      screenShare: this.screenShare,
      screenStream: activeScreen,
      activeSpeaker: this.activeSpeaker,
      peerToast: this.peerToast,
      handToast: this.handToast,
      reactions: this.reactions,
      selfHandRaised: this.selfHandRaised,
      selfRaisedAt: this.selfRaisedAt,
      selfFeedback: this.selfFeedback,
      activePoll: this.activePoll,
      liveCaption: this.liveCaption,
      transcript: this.transcript,
      peers: [...this.peers.entries()].map(([peerId, entry]) => ({
        peerId,
        user: entry.user,
        stream: entry.stream,
        connectionState: entry.connectionState,
        audio: entry.audio,
        video: entry.video,
        isHost: Boolean(entry.isHost || entry.user?.isHost || entry.role === 'host'),
        isCoHost: Boolean(entry.isCoHost || entry.user?.isCoHost || entry.role === 'co-host'),
        role: entry.role || (entry.isHost ? 'host' : entry.isCoHost ? 'co-host' : 'participant'),
        handRaised: Boolean(entry.handRaised),
        raisedAt: entry.raisedAt || null,
        feedback: entry.feedback || null,
      })),
    };
    this.listeners.forEach((listener) => listener(this.state));
  }
}

function toCallError(err) {
  return { code: err?.code ?? 'UNKNOWN', message: err?.message ?? 'Something went wrong' };
}
