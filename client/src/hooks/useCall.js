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
  messages: [],
  unreadCount: 0,
  historyLoading: false,
  historyError: null,
  rateLimitHint: null,
  peerToast: null,
};

// Joins the meeting `code` once `enabled` is true and leaves when the component unmounts,
// the inputs change or the tab closes.
//   localMedia: { audio, video } booleans for the microphone and camera. Changes are sent to
//   the other participants without restarting the call.
// Returns the CallSession state:
//   { status, error, selfId, peers, waitingList, hostInRoom, messages, unreadCount, historyLoading, historyError, rateLimitHint }
// plus retry(), which starts a fresh session, host actions and chat actions.
// Keep `rtcConfig` stable between renders (define it outside the component or memoize it).
export default function useCall({
  code,
  localStream,
  localMedia,
  enabled = true,
  rtcConfig,
  currentUser = null,
}) {
  const [state, setState] = useState(INITIAL);
  const [attempt, setAttempt] = useState(0);
  const sessionRef = useRef(null);

  // The session reads the latest values when it needs them, so toggling does not recreate it
  const mediaRef = useRef(localMedia);
  mediaRef.current = localMedia;

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
  }, [code, enabled, localStream, rtcConfig, attempt, currentUser?.id]);

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
  const removePeer = useCallback((peerId) => sessionRef.current?.removePeer(peerId), []);
  const endMeeting = useCallback(() => sessionRef.current?.endMeeting(), []);

  const sendMessage = useCallback((text, to) => sessionRef.current?.sendMessage(text, to), []);
  const retryMessage = useCallback((id) => sessionRef.current?.retryMessage(id), []);
  const clearUnread = useCallback(() => sessionRef.current?.clearUnread(), []);
  const setChatOpen = useCallback((isOpen) => sessionRef.current?.setChatOpen(isOpen), []);
  const loadHistory = useCallback(() => sessionRef.current?.loadHistory(), []);

  const startScreenShare = useCallback(() => sessionRef.current?.startScreenShare(), []);
  const stopScreenShare = useCallback(() => sessionRef.current?.stopScreenShare(), []);
  const stopHostScreenShare = useCallback(() => sessionRef.current?.stopHostScreenShare(), []);

  return {
    ...state,
    retry,
    refreshWaitingList,
    admitPeer,
    denyPeer,
    admitAllPeers,
    removePeer,
    endMeeting,
    sendMessage,
    retryMessage,
    clearUnread,
    setChatOpen,
    loadHistory,
    startScreenShare,
    stopScreenShare,
    stopHostScreenShare,
  };
}
