import { useCallback, useEffect, useRef, useState } from 'react';

import { tokenStorage } from '../api/client.js';
import { API_URL } from '../config.js';
import { CallSession } from '../webrtc/call.js';

const INITIAL = {
  status: 'idle',
  error: null,
  selfId: null,
  peers: [],
  waitingList: [],
  hostInRoom: true,
  isHost: false,
};

// Joins the meeting `code` once `enabled` is true and leaves when the component unmounts,
// the inputs change or the tab closes.
//   localMedia: { audio, video } booleans for the microphone and camera. Changes are sent to
//   the other participants without restarting the call.
// Returns the CallSession state:
//   { status, error, selfId, peers, waitingList, hostInRoom }
// plus retry(), which starts a fresh session, and host actions (admitPeer, denyPeer, etc.).
// Keep `rtcConfig` stable between renders (define it outside the component or memoize it).
export default function useCall({ code, localStream, localMedia, enabled = true, rtcConfig }) {
  const [state, setState] = useState(INITIAL);
  const [attempt, setAttempt] = useState(0);
  const sessionRef = useRef(null);

  // The session reads the latest values when it needs them, so toggling does not recreate it
  const mediaRef = useRef(localMedia);
  mediaRef.current = localMedia;

  useEffect(() => {
    if (!enabled || !code) {
      setState(INITIAL);
      return undefined;
    }

    const session = new CallSession({
      code,
      url: API_URL,
      getToken: tokenStorage.get,
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
  }, [code, enabled, localStream, rtcConfig, attempt]);

  const audio = localMedia?.audio;
  const video = localMedia?.video;
  useEffect(() => {
    sessionRef.current?.updateLocalMedia();
  }, [audio, video]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const admitPeer = useCallback((peerId) => sessionRef.current?.admitPeer(peerId), []);
  const denyPeer = useCallback((peerId) => sessionRef.current?.denyPeer(peerId), []);
  const admitAllPeers = useCallback(() => sessionRef.current?.admitAllPeers(), []);
  const removePeer = useCallback((peerId) => sessionRef.current?.removePeer(peerId), []);
  const endMeeting = useCallback(() => sessionRef.current?.endMeeting(), []);

  return {
    ...state,
    retry,
    admitPeer,
    denyPeer,
    admitAllPeers,
    removePeer,
    endMeeting,
  };
}
