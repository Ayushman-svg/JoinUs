import {
  Check,
  ChevronsDown,
  ChevronsUp,
  Coffee,
  Hand,
  MicOff,
  MoreHorizontal,
  Pin,
  X,
} from 'lucide-react';
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
  isCoHost = false,
  handRaised = false,
  feedback = null,
  reaction = null,
  isPinned = false,
  onPinToggle,
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

      {/* Top Left: Hand Raised & Feedback Badges */}
      <div className="zoom-tile__status-badges">
        {reactionsEnabled && handRaised && (
          <div className="zoom-tile__hand-badge" role="status">
            <Hand size={14} aria-hidden="true" className="icon-hand" />
            <span>Hand Raised</span>
          </div>
        )}
        {reactionsEnabled && feedback && (
          <div
            className={`zoom-tile__feedback-badge zoom-tile__feedback-badge--${feedback}`}
            role="status"
            title={`Feedback: ${feedback}`}
          >
            {feedback === 'yes' && <Check size={13} aria-hidden="true" />}
            {feedback === 'no' && <X size={13} aria-hidden="true" />}
            {feedback === 'slower' && <ChevronsDown size={13} aria-hidden="true" />}
            {feedback === 'faster' && <ChevronsUp size={13} aria-hidden="true" />}
            {feedback === 'break' && <Coffee size={13} aria-hidden="true" />}
            <span>{feedback === 'break' ? 'Break' : feedback.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Top Right: Pin button & More options */}
      <div className="zoom-tile__top-actions">
        {onPinToggle && (
          <button
            type="button"
            className={`zoom-tile__pin-btn ${isPinned ? 'is-pinned' : ''}`}
            onClick={onPinToggle}
            aria-label={isPinned ? `Unpin ${name}` : `Pin ${name}`}
            title={isPinned ? 'Unpin' : 'Pin to main view'}
          >
            <Pin size={13} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="zoom-tile__more-btn"
          aria-label={`Options for ${name}`}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </div>

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
          {isHost ? (
            <span className="zoom-tile__host-tag"> (Host)</span>
          ) : isCoHost ? (
            <span className="zoom-tile__host-tag zoom-tile__host-tag--cohost"> (Co-host)</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
