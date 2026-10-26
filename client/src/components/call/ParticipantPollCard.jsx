import { AlertCircle, CheckCircle2, Eye, EyeOff, X } from 'lucide-react';
import React, { useState } from 'react';

import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import PollResultBar from './PollResultBar.jsx';

/**
 * ParticipantPollCard: Floating card displayed to peers during active polls.
 * Contains: radio or checkbox options, submit button, confirmation message, and final results view.
 */
export default function ParticipantPollCard({
  poll,
  onSubmitVote,
  onDismiss,
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!poll) return null;

  const isOpen = poll.status === 'open';
  const isClosed = poll.status === 'closed';
  const hasVoted = Boolean(poll.hasVoted);

  const handleToggle = (optId) => {
    if (poll.multiple) {
      setSelectedIds((prev) =>
        prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId]
      );
    } else {
      setSelectedIds([optId]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmitVote?.(poll.id, selectedIds);
    } catch (err) {
      setError(err?.message || 'Failed to submit vote');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="participant-poll-card"
      role="region"
      aria-label={`Poll: ${poll.question}`}
    >
      <div className="participant-poll-card__header">
        <div className="participant-poll-card__badges">
          <Badge variant={isOpen ? 'success' : 'secondary'}>
            {isOpen ? 'Live Poll' : 'Poll Closed'}
          </Badge>
          {poll.anonymous ? (
            <Badge variant="neutral">
              <EyeOff size={12} aria-hidden="true" style={{ marginRight: 4 }} />
              Anonymous
            </Badge>
          ) : (
            <Badge variant="neutral">
              <Eye size={12} aria-hidden="true" style={{ marginRight: 4 }} />
              Public
            </Badge>
          )}
          {poll.multiple && <Badge variant="neutral">Select multiple</Badge>}
        </div>

        <button
          type="button"
          className="participant-poll-card__close-btn"
          onClick={onDismiss}
          aria-label="Dismiss poll notification"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <h3 className="participant-poll-card__question">{poll.question}</h3>

      {error && (
        <div className="polls-alert polls-alert--error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* State 1: Open and not yet voted -> Options & Submit */}
      {isOpen && !hasVoted && (
        <form onSubmit={handleSubmit} className="participant-poll-card__form">
          <div
            className="participant-poll-card__options"
            role={poll.multiple ? 'group' : 'radiogroup'}
            aria-label={poll.question}
          >
            {(poll.options || []).map((opt) => {
              const isChecked = selectedIds.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`participant-poll-card__option ${
                    isChecked ? 'is-selected' : ''
                  }`}
                >
                  <input
                    type={poll.multiple ? 'checkbox' : 'radio'}
                    name={`poll-card-${poll.id}`}
                    value={opt.id}
                    checked={isChecked}
                    onChange={() => handleToggle(opt.id)}
                  />
                  <span className="participant-poll-card__option-text">{opt.text}</span>
                </label>
              );
            })}
          </div>

          <div className="participant-poll-card__actions">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={selectedIds.length === 0 || submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Vote'}
            </Button>
          </div>
        </form>
      )}

      {/* State 2: Open and voted -> Confirmation */}
      {isOpen && hasVoted && (
        <div className="participant-poll-card__confirmation" role="status">
          <CheckCircle2 size={24} className="participant-poll-card__confirm-icon" aria-hidden="true" />
          <h4 className="participant-poll-card__confirm-title">Vote Submitted</h4>
          <p className="participant-poll-card__confirm-text">
            {poll.shareResults
              ? 'Results will be shown here once the host closes the poll.'
              : 'Thank you for participating! Results will remain private.'}
          </p>
        </div>
      )}

      {/* State 3: Closed -> Results view (if shareResults) or notice */}
      {isClosed && (
        <div className="participant-poll-card__results">
          {poll.shareResults ? (
            <>
              <div className="participant-poll-card__results-list" role="region" aria-label="Final results">
                {(poll.options || []).map((opt) => (
                  <PollResultBar
                    key={opt.id}
                    option={opt}
                    totalVotes={poll.totalVotes || 0}
                    isUserVote={poll.userVote?.includes(opt.id)}
                  />
                ))}
              </div>
              <div className="participant-poll-card__meta">
                <span>Total votes: {poll.totalVotes || 0}</span>
              </div>
            </>
          ) : (
            <p className="participant-poll-card__no-share">
              This poll has ended. The host chose not to share results.
            </p>
          )}

          <div className="participant-poll-card__actions">
            <Button variant="secondary" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
