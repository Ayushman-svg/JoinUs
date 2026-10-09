import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getLocalStreamWithFallback,
  hasLiveTrack,
  isMediaSupported,
  isTrackEnabled,
  setTrackEnabled,
  stopStream,
  watchTracks,
} from '../webrtc/media.js';

const IDLE = { status: 'idle', stream: null, error: null, audioError: null, videoError: null };

// React wrapper around webrtc/media.js for a local camera and microphone.
//   status: 'idle' | 'requesting' | 'ready' | 'error'
//   error: a MediaError when nothing could be captured (code + friendly message)
//   audioError / videoError: set when one device failed but the other works
//   deviceLost: 'audio' | 'video' when a device stops by itself during use
// The devices are released when the component unmounts.
export default function useLocalMedia({ audio = true, video = true, autoStart = true } = {}) {
  const [state, setState] = useState(IDLE);
  const [enabled, setEnabled] = useState({ audio: true, video: true });
  const [deviceLost, setDeviceLost] = useState(null);

  const streamRef = useRef(null);
  const unwatchRef = useRef(null);
  const requestId = useRef(0);
  const mounted = useRef(false);

  const release = useCallback(() => {
    unwatchRef.current?.();
    unwatchRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;

    release();
    setDeviceLost(null);
    setState({ ...IDLE, status: 'requesting' });

    try {
      const { stream, audioError, videoError } = await getLocalStreamWithFallback({ audio, video });

      // The component went away or a newer request started: give the devices back
      if (!mounted.current || id !== requestId.current) {
        stopStream(stream);
        return null;
      }

      streamRef.current = stream;
      unwatchRef.current = watchTracks(stream, setDeviceLost);
      setEnabled({ audio: isTrackEnabled(stream, 'audio'), video: isTrackEnabled(stream, 'video') });
      setState({ status: 'ready', stream, error: null, audioError, videoError });
      return stream;
    } catch (err) {
      if (mounted.current && id === requestId.current) {
        setState({ ...IDLE, status: 'error', error: err });
      }
      return null;
    }
  }, [audio, video, release]);

  const stop = useCallback(() => {
    requestId.current += 1;
    release();
    setDeviceLost(null);
    setState(IDLE);
  }, [release]);

  const toggle = useCallback((kind) => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !isTrackEnabled(stream, kind);
    if (setTrackEnabled(stream, kind, next)) {
      setEnabled((prev) => ({ ...prev, [kind]: next }));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (autoStart) start();
    return () => {
      mounted.current = false;
      requestId.current += 1;
      release();
    };
  }, [autoStart, start, release]);

  const { stream } = state;
  const hasAudio = hasLiveTrack(stream, 'audio');
  const hasVideo = hasLiveTrack(stream, 'video');

  return {
    supported: isMediaSupported(),
    status: state.status,
    stream,
    error: state.error,
    audioError: state.audioError,
    videoError: state.videoError,
    hasAudio,
    hasVideo,
    audioEnabled: hasAudio && enabled.audio,
    videoEnabled: hasVideo && enabled.video,
    deviceLost,
    start,
    retry: start,
    stop,
    toggleAudio: () => toggle('audio'),
    toggleVideo: () => toggle('video'),
  };
}
