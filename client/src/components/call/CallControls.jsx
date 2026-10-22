import { PhoneOff, Users } from 'lucide-react';

import MediaToggleButton from '../MediaToggleButton.jsx';
import Button from '../ui/Button.jsx';
import Tooltip from '../ui/Tooltip.jsx';

// Floating bar at the bottom of the call. Leave is set apart from the toggles, so it is
// not hit by accident, and it asks for confirmation before anything happens.
export default function CallControls({
  media,
  onLeave,
  waitingCount = 0,
  participantCount = 1,
  isPanelOpen = false,
  onToggleParticipants,
}) {
  const isWaitingBadge = waitingCount > 0;
  const badgeCount = isWaitingBadge ? waitingCount : participantCount;
  const participantsLabel = isWaitingBadge
    ? `Participants (${waitingCount} waiting)`
    : `Participants (${participantCount})`;

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

      <Tooltip label={isPanelOpen ? 'Close participants' : participantsLabel} side="top">
        <Button
          iconOnly
          size="lg"
          variant={isPanelOpen ? 'primary' : 'secondary'}
          className="controls__participants-btn"
          aria-label={participantsLabel}
          aria-pressed={isPanelOpen}
          onClick={onToggleParticipants}
        >
          <Users size={22} aria-hidden="true" />
          <span
            className={`controls__badge ${
              isWaitingBadge ? 'controls__badge--waiting' : 'controls__badge--count'
            }`}
          >
            {badgeCount}
          </span>
        </Button>
      </Tooltip>

      <span className="controls__divider" role="separator" aria-orientation="vertical" />
      <Button variant="danger" size="lg" leftIcon={PhoneOff} aria-label="Leave meeting" onClick={onLeave}>
        Leave
      </Button>
    </div>
  );
}
