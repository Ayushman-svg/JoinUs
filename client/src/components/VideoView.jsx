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
      const handleTrackUpdate = () => {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        video.play()?.catch(() => {});
      };
      stream.addEventListener?.('addtrack', handleTrackUpdate);
      stream.addEventListener?.('removetrack', handleTrackUpdate);

      // Browsers can refuse to start sound before the page has been clicked
      video.play()?.catch((err) => {
        if (err.name === 'NotAllowedError') setBlocked(true);
      });

      return () => {
        stream.removeEventListener?.('addtrack', handleTrackUpdate);
        stream.removeEventListener?.('removetrack', handleTrackUpdate);
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
