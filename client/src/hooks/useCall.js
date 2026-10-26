import { useCallback, useEffect, useRef, useState } from 'react';

import { tokenStorage } from '../api/client.js';
import { API_URL } from '../config.js';
import { CallSession } from '../webrtc/call.js';

const INITIAL = {
  status: 'idle',
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

// Joins the meeting `code` once `enabled` is true and leaves when the component unmounts,
// the inputs change or the tab closes.
//   localMedia: { audio, video } booleans for the microphone and camera. Changes are sent to
//   the other participants without restarting the call.
// Returns the CallSession state:
//   { status, error, selfId, peers, waitingList, hostInRoom, messages, unreadCount, historyLoading, historyError, rateLimitHint, role, isCoHost, canModerate, roomSettings, isLocked }
// plus retry(), which starts a fresh session, host security actions and chat actions.
// Keep `rtcConfig` stable between renders (define it outside the component or memoize it).
export default function useCall({
  code,
  localStream,
  localMedia,
  enabled = true,
  rtcConfig,
  currentUser = null,
  passcode = null,
  onMuteDirective = null,
  onStopVideoDirective = null,
  onRequestUnmute = null,
}) {
  const [state, setState] = useState(INITIAL);
  const [attempt, setAttempt] = useState(0);
  const sessionRef = useRef(null);

  // The session reads the latest values when it needs them, so toggling does not recreate it
  const mediaRef = useRef(localMedia);
  mediaRef.current = localMedia;

  const callbacksRef = useRef({ onMuteDirective, onStopVideoDirective, onRequestUnmute });
  callbacksRef.current = { onMuteDirective, onStopVideoDirective, onRequestUnmute };

  useEffect(() => {
    if (!enabled || !code) {
      setState((prev) => (['ended', 'denied', 'removed'].includes(prev.status) ? prev : INITIAL));
      return undefined;
    }

    const session = new CallSession({
      code,
      url: API_URL,
      getToken: tokenStorage.get,
      currentUser,
      localStream,
      getLocalMedia: () => mediaRef.current ?? { audio: true, video: true },
      rtcConfig,
      passcode,
      onMuteDirective: () => callbacksRef.current.onMuteDirective?.(),
      onStopVideoDirective: () => callbacksRef.current.onStopVideoDirective?.(),
      onRequestUnmute: (data) => callbacksRef.current.onRequestUnmute?.(data),
    });
    sessionRef.current = session;
    const stopListening = session.on('state', setState);
    session.start();

    const onPageHide = () => session.leave();
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      stopListening();
      session.leave();
      sessionRef.current = null;
    };
  }, [code, enabled, localStream, rtcConfig, attempt, currentUser?.id, passcode]);

  const audio = localMedia?.audio;
  const video = localMedia?.video;
  useEffect(() => {
    sessionRef.current?.updateLocalMedia();
  }, [audio, video]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const refreshWaitingList = useCallback(() => sessionRef.current?.refreshWaitingList(), []);
  const admitPeer = useCallback((peerId) => sessionRef.current?.admitPeer(peerId), []);
  const denyPeer = useCallback((peerId) => sessionRef.current?.denyPeer(peerId), []);
  const admitAllPeers = useCallback(() => sessionRef.current?.admitAllPeers(), []);
  const removePeer = useCallback(
    (peerId, block = false) => sessionRef.current?.removePeer(peerId, block),
    []
  );
  const endMeeting = useCallback(() => sessionRef.current?.endMeeting(), []);

  const lockMeeting = useCallback((locked) => sessionRef.current?.lockMeeting(locked), []);
  const updateRoomSettings = useCallback(
    (settings) => sessionRef.current?.updateRoomSettings(settings),
    []
  );
  const promoteCoHost = useCallback((peerId) => sessionRef.current?.promoteCoHost(peerId), []);
  const demoteCoHost = useCallback((peerId) => sessionRef.current?.demoteCoHost(peerId), []);
  const mutePeer = useCallback((peerId) => sessionRef.current?.mutePeer(peerId), []);
  const muteAllPeers = useCallback(() => sessionRef.current?.muteAllPeers(), []);
  const requestUnmute = useCallback((peerId) => sessionRef.current?.requestUnmute(peerId), []);
  const stopPeerVideo = useCallback((peerId) => sessionRef.current?.stopPeerVideo(peerId), []);
  const renamePeer = useCallback(
    (peerId, name) => sessionRef.current?.renamePeer(peerId, name),
    []
  );
  const dismissUnmuteRequest = useCallback(
    () => sessionRef.current?.dismissUnmuteRequest(),
    []
  );
  const clearSecurityToast = useCallback(() => sessionRef.current?.clearSecurityToast(), []);

  const sendMessage = useCallback((text, to) => sessionRef.current?.sendMessage(text, to), []);
  const retryMessage = useCallback((id) => sessionRef.current?.retryMessage(id), []);
  const clearUnread = useCallback(() => sessionRef.current?.clearUnread(), []);
  const setChatOpen = useCallback((isOpen) => sessionRef.current?.setChatOpen(isOpen), []);
  const loadHistory = useCallback(() => sessionRef.current?.loadHistory(), []);

  const startScreenShare = useCallback(() => sessionRef.current?.startScreenShare(), []);
  const stopScreenShare = useCallback(() => sessionRef.current?.stopScreenShare(), []);
  const stopHostScreenShare = useCallback(() => sessionRef.current?.stopHostScreenShare(), []);
  const replaceTrack = useCallback((kind, newTrack) => sessionRef.current?.replaceTrack(kind, newTrack), []);

  const sendReaction = useCallback((kind) => sessionRef.current?.sendReaction(kind), []);
  const setHandRaised = useCallback((raised, peerId) => sessionRef.current?.setHandRaised(raised, peerId), []);
  const setFeedback = useCallback((kind) => sessionRef.current?.setFeedback(kind), []);
  const lowerPeerHand = useCallback((peerId) => sessionRef.current?.lowerPeerHand(peerId), []);

  const createPoll = useCallback((payload) => sessionRef.current?.createPoll(payload), []);
  const launchPoll = useCallback((pollId) => sessionRef.current?.launchPoll(pollId), []);
  const closePoll = useCallback((pollId) => sessionRef.current?.closePoll(pollId), []);
  const submitVote = useCallback((pollId, optionIds) => sessionRef.current?.submitVote(pollId, optionIds), []);
  const dismissActivePoll = useCallback(() => sessionRef.current?.dismissActivePoll(), []);

  const sendCaptionSegment = useCallback(
    (text, final) => sessionRef.current?.sendCaptionSegment(text, final),
    []
  );

  return {
    ...state,
    retry,
    refreshWaitingList,
    admitPeer,
    denyPeer,
    admitAllPeers,
    removePeer,
    endMeeting,
    lockMeeting,
    updateRoomSettings,
    promoteCoHost,
    demoteCoHost,
    mutePeer,
    muteAllPeers,
    requestUnmute,
    stopPeerVideo,
    renamePeer,
    dismissUnmuteRequest,
    clearSecurityToast,
    sendMessage,
    retryMessage,
    clearUnread,
    setChatOpen,
    loadHistory,
    startScreenShare,
    stopScreenShare,
    stopHostScreenShare,
    replaceTrack,
    sendReaction,
    setHandRaised,
    setFeedback,
    lowerPeerHand,
    createPoll,
    launchPoll,
    closePoll,
    submitVote,
    dismissActivePoll,
    sendCaptionSegment,
  };
}
