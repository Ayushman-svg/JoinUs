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
      const preferredMic = typeof localStorage !== 'undefined' ? localStorage.getItem('joinus_preferred_mic') : null;
      const preferredCam = typeof localStorage !== 'undefined' ? localStorage.getItem('joinus_preferred_cam') : null;

      const { stream, audioError, videoError } = await getLocalStreamWithFallback({
        audio,
        video,
        audioDeviceId: preferredMic,
        videoDeviceId: preferredCam,
      });

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

  const switchDevice = useCallback(
    async (kind, deviceId) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
      try {
        const constraints =
          kind === 'audio'
            ? {
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                  ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}),
                },
              }
            : {
                video: {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  frameRate: { ideal: 30, max: 30 },
                  ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}),
                },
              };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        const newTrack = newStream.getTracks().find((t) => t.kind === kind);
        if (!newTrack) return null;

        let currentStream = streamRef.current;
        if (currentStream) {
          const oldTracks = currentStream.getTracks().filter((t) => t.kind === kind);
          oldTracks.forEach((t) => {
            currentStream.removeTrack(t);
            t.stop();
          });

          newTrack.enabled = true;
          currentStream.addTrack(newTrack);
        } else {
          currentStream = newStream;
          streamRef.current = currentStream;
          unwatchRef.current = watchTracks(currentStream, setDeviceLost);
        }

        setEnabled((prev) => ({ ...prev, [kind]: true }));
        setState((prev) => ({
          ...prev,
          status: 'ready',
          stream: currentStream,
          error: null,
          [kind === 'audio' ? 'audioError' : 'videoError']: null,
        }));

        if (deviceId && deviceId !== 'default') {
          try {
            localStorage.setItem(
              kind === 'audio' ? 'joinus_preferred_mic' : 'joinus_preferred_cam',
              deviceId
            );
          } catch {}
        }

        return newTrack;
      } catch (err) {
        console.warn(`Failed to switch/acquire ${kind} device:`, err);
        return null;
      }
    },
    []
  );

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
    switchDevice,
  };
}
