import { Hand, MicOff, MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFeature } from '../../hooks/useFeature.js';

import Avatar from '../ui/Avatar.jsx';
import Spinner from '../ui/Spinner.jsx';
import VideoView from '../VideoView.jsx';

const WAITING_TEXT = {
  new: 'Connecting…',
  connecting: 'Connecting…',
  disconnected: 'Reconnecting…',
  failed: 'Reconnecting…',
};

export default function ParticipantTile({
  name,
  stream,
  local = false,
  audioOn,
  videoOn,
  connectionState,
  isSpeaking = false,
  isHost = false,
  handRaised = false,
  reaction = null,
}) {
  const reactionsEnabled = useFeature('REACTIONS');
  const [floatingReaction, setFloatingReaction] = useState(null);

  useEffect(() => {
    if (reaction) {
      setFloatingReaction(reaction);
      const timer = setTimeout(() => setFloatingReaction(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [reaction]);

  const waiting = !local ? WAITING_TEXT[connectionState] : null;
  const showSpeaking = Boolean(isSpeaking && audioOn);

  const description = [
    name,
    isHost && 'Host',
    !audioOn && 'microphone off',
    !videoOn && 'camera off',
    showSpeaking && 'speaking',
    reactionsEnabled && handRaised && 'hand raised',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      className={`tile zoom-tile ${showSpeaking ? 'tile--speaking zoom-tile--speaking' : ''}`}
      role="group"
      aria-label={description}
    >
      <VideoView stream={stream} muted={local} mirrored={local} />

      {!videoOn && (
        <div className="tile__avatar zoom-tile__avatar">
          <Avatar name={name} size="xl" />
        </div>
      )}

      {waiting && (
        <div className="tile__status" role="status">
          <Spinner size="sm" />
          {waiting}
        </div>
      )}

      {/* Top Left: Hand Raised Badge */}
      {reactionsEnabled && handRaised && (
        <div className="zoom-tile__hand-badge" role="status">
          <Hand size={14} aria-hidden="true" className="icon-hand" />
          <span>Hand Raised</span>
        </div>
      )}

      {/* Top Right: Hover 3-dots */}
      <button
        type="button"
        className="zoom-tile__more-btn"
        aria-label={`Options for ${name}`}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>

      {/* Floating Reaction Animation */}
      {reactionsEnabled && floatingReaction && (
        <div className="zoom-tile__floating-reaction" aria-hidden="true">
          {floatingReaction}
        </div>
      )}

      {/* Bottom Left: Name & Audio Status Tag */}
      <div className="tile__label zoom-tile__name-tag">
        {!audioOn ? (
          <span className="zoom-tile__mic-status zoom-tile__mic-status--muted" title="Microphone muted">
            <MicOff size={13} aria-label="Muted" />
          </span>
        ) : showSpeaking ? (
          <span className="tile__audio-bars zoom-tile__speaking-bars" aria-label="Speaking" role="img">
            <span className="tile__bar" />
            <span className="tile__bar" />
            <span className="tile__bar" />
          </span>
        ) : null}
        <span className="zoom-tile__name-text">
          {name}
          {isHost && <span className="zoom-tile__host-tag"> (Host)</span>}
        </span>
      </div>
    </div>
  );
}
