import { useEffect, useState } from 'react';

import { tokenStorage } from '../api/client.js';
import { API_URL } from '../config.js';
import { CallSession } from '../webrtc/call.js';

const INITIAL = { status: 'idle', error: null, selfId: null, peers: [] };

// Joins the meeting `code` once `enabled` is true and leaves when the component unmounts,
// the inputs change or the tab closes. Returns the CallSession state:
//   { status, error, selfId, peers: [{ peerId, user, stream, connectionState }] }
// Keep `rtcConfig` stable between renders (define it outside the component or memoize it).
export default function useCall({ code, localStream, enabled = true, rtcConfig }) {
  const [state, setState] = useState(INITIAL);

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
      rtcConfig,
    });
    const stopListening = session.on('state', setState);
    session.start();

    const onPageHide = () => session.leave();
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      stopListening();
      session.leave();
    };
  }, [code, enabled, localStream, rtcConfig]);

  return state;
}
