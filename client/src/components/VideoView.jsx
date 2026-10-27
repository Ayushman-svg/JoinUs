import { useEffect, useRef, useState } from 'react';

import Button from './ui/Button.jsx';

// A <video> that plays a MediaStream. Put it inside a positioned element: it fills it.
// muted: always set it for your own preview, so you do not hear yourself.
// mirrored: flips the picture like a mirror (for self view).
export default function VideoView({ stream, muted = false, mirrored = false, className = '' }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream ?? null;
    setBlocked(false);

    if (stream) {
      const playVideo = () => {
        if (!video.srcObject) return;
        video.play()?.catch((err) => {
          if (err.name === 'NotAllowedError') setBlocked(true);
        });
      };

      const handleTrackUpdate = () => {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        playVideo();
      };

      stream.addEventListener?.('addtrack', handleTrackUpdate);
      stream.addEventListener?.('removetrack', handleTrackUpdate);

      // Track-level listener: WebRTC tracks unmute when first RTP media packets arrive
      const tracks = typeof stream.getTracks === 'function' ? stream.getTracks() : [];
      tracks.forEach((track) => {
        track.addEventListener?.('unmute', playVideo);
      });

      // HTML5 video readiness events
      video.addEventListener('loadedmetadata', playVideo);
      video.addEventListener('canplay', playVideo);
      video.addEventListener('canplaythrough', playVideo);

      playVideo();

      return () => {
        stream.removeEventListener?.('addtrack', handleTrackUpdate);
        stream.removeEventListener?.('removetrack', handleTrackUpdate);
        tracks.forEach((track) => {
          track.removeEventListener?.('unmute', playVideo);
        });
        video.removeEventListener('loadedmetadata', playVideo);
        video.removeEventListener('canplay', playVideo);
        video.removeEventListener('canplaythrough', playVideo);
      };
    }
  }, [stream]);

  return (
    <>
      <video
        ref={ref}
        className={`video-view ${mirrored ? 'is-mirrored' : ''} ${className}`.trim()}
        autoPlay
        playsInline
        muted={muted}
      />
      {blocked && (
        <Button
          size="sm"
          className="video-view__play"
          onClick={() => ref.current?.play().then(() => setBlocked(false))}
        >
          Tap to play
        </Button>
      )}
    </>
  );
}
