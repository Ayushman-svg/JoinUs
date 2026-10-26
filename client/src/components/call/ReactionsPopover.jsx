import {
  Check,
  ChevronsDown,
  ChevronsUp,
  Coffee,
  Hand,
  X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

export const REACTION_EMOJIS = {
  'thumbs-up': '👍',
  clap: '👏',
  heart: '❤️',
  laugh: '😂',
  celebrate: '🎉',
};

export const REACTION_OPTIONS = [
  { kind: 'thumbs-up', emoji: '👍', label: 'Thumbs Up' },
  { kind: 'clap', emoji: '👏', label: 'Clap' },
  { kind: 'heart', emoji: '❤️', label: 'Heart' },
  { kind: 'laugh', emoji: '😂', label: 'Laugh' },
  { kind: 'celebrate', emoji: '🎉', label: 'Celebrate' },
];

export const FEEDBACK_OPTIONS = [
  { kind: 'yes', label: 'Yes', icon: Check, color: 'text-success' },
  { kind: 'no', label: 'No', icon: X, color: 'text-danger' },
  { kind: 'slower', label: 'Slower', icon: ChevronsDown, color: 'text-warning' },
  { kind: 'faster', label: 'Faster', icon: ChevronsUp, color: 'text-info' },
  { kind: 'break', label: 'Need a break', icon: Coffee, color: 'text-purple' },
];

export default function ReactionsPopover({
  open,
  isOpen,
  onClose,
  onSendReaction,
  handRaised = false,
  onToggleHandRaise,
  currentFeedback = null,
  onSetFeedback,
}) {
  const isPopoverOpen = Boolean(open ?? isOpen);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!isPopoverOpen) return undefined;
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose?.();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isPopoverOpen, onClose]);

  if (!isPopoverOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="zoom-reactions-popover"
      role="dialog"
      aria-label="Reactions and Feedback"
    >
      {/* Quick Emojis Row */}
      <div className="zoom-reactions-popover__emojis" role="toolbar" aria-label="Quick reactions">
        {REACTION_OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            className="zoom-reaction-btn"
            onClick={() => {
              onSendReaction(opt.kind);
              onClose();
            }}
            aria-label={opt.label}
            title={opt.label}
          >
            <span className="zoom-reaction-emoji" aria-hidden="true">
              {opt.emoji}
            </span>
          </button>
        ))}
      </div>

      <div className="zoom-reactions-popover__divider" />

      {/* Speed & Non-verbal Feedback Row */}
      <div className="zoom-reactions-popover__feedback" role="group" aria-label="Meeting feedback">
        <span className="zoom-reactions-popover__section-title">Speed / Feedback</span>
        <div className="zoom-reactions-feedback-grid">
          {FEEDBACK_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = currentFeedback === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                className={`zoom-feedback-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  onSetFeedback(isSelected ? null : opt.kind);
                  onClose();
                }}
                aria-pressed={isSelected}
                aria-label={opt.label}
                title={opt.label}
              >
                <Icon size={16} aria-hidden="true" className={opt.color} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {currentFeedback && (
          <button
            type="button"
            className="zoom-feedback-clear-btn"
            onClick={() => {
              onSetFeedback(null);
              onClose();
            }}
          >
            Clear current feedback ({currentFeedback})
          </button>
        )}
      </div>

      <div className="zoom-reactions-popover__divider" />

      {/* Raise Hand Action */}
      <div className="zoom-reactions-popover__actions">
        <button
          type="button"
          className={`zoom-popover-hand-btn ${handRaised ? 'is-active' : ''}`}
          onClick={() => {
            onToggleHandRaise();
            onClose();
          }}
          aria-pressed={handRaised}
        >
          <Hand size={18} aria-hidden="true" className={handRaised ? 'icon-hand-active' : ''} />
          <span>{handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
        </button>
      </div>
    </div>
  );
}
