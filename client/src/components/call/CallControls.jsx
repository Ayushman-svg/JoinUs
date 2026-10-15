import { PhoneOff } from 'lucide-react';

import MediaToggleButton from '../MediaToggleButton.jsx';
import Button from '../ui/Button.jsx';

// Floating bar at the bottom of the call. Leave is set apart from the toggles, so it is
// not hit by accident, and it asks for confirmation before anything happens.
export default function CallControls({ media, onLeave }) {
  return (
    <div className="controls" role="toolbar" aria-label="Meeting controls">
      <MediaToggleButton
        kind="audio"
        enabled={media.audioEnabled}
        available={media.hasAudio}
        onToggle={media.toggleAudio}
      />
      <MediaToggleButton
        kind="video"
        enabled={media.videoEnabled}
        available={media.hasVideo}
        onToggle={media.toggleVideo}
      />
      <span className="controls__divider" role="separator" aria-orientation="vertical" />
      <Button variant="danger" size="lg" leftIcon={PhoneOff} aria-label="Leave meeting" onClick={onLeave}>
        Leave
      </Button>
    </div>
  );
}
