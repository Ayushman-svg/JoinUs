import { MicOff } from 'lucide-react';

import Avatar from './ui/Avatar.jsx';
import VideoView from './VideoView.jsx';

// Your own picture: the camera when it is on, your initials when it is off or missing.
// Always dark (theme-meeting), whatever the page theme. Children render on top, at the bottom.
export default function PreviewTile({ stream, name, hasVideo, videoEnabled, audioEnabled, children }) {
  const showAvatar = !hasVideo || !videoEnabled;

  return (
    <div className="preview theme-meeting">
      <VideoView stream={stream} muted mirrored />

      {showAvatar && (
        <div className="preview__avatar">
          <Avatar name={name} size="xl" />
          <span>{hasVideo ? 'Camera is off' : 'No camera'}</span>
        </div>
      )}

      <div className="preview__label">
        {!audioEnabled && <MicOff size={14} aria-label="Microphone is off" />}
        <span>{name}</span>
      </div>

      <div className="preview__controls">{children}</div>
    </div>
  );
}
