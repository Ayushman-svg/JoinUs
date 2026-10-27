import {
  AlertCircle,
  BarChart2,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Plus,
  Play,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import React, { useState } from 'react';

import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Tooltip from '../ui/Tooltip.jsx';
import PollResultBar from './PollResultBar.jsx';
import { exportPollCsv } from '../../api/meetings.js';

export default function PollsPanel({
  isOpen,
  onClose,
  onSwitchToParticipants,
  onSwitchToChat,
  participantCount = 1,
  waitingCount = 0,
  unreadCount = 0,
  canModerate = false,
  isHost = false,
  activePoll = null,
  meetingCode = '',
  onCreatePoll,
  onLaunchPoll,
  onClosePoll,
  onSubmitVote,
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(true);
  const [shareResults, setShareResults] = useState(true);
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Participant voting state within panel
  const [selectedOptionIds, setSelectedOptionIds] = useState([]);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voteError, setVoteError] = useState(null);

  // Option handlers
  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index, value) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const resetForm = () => {
    setQuestion('');
    setOptions(['', '']);
    setMultiple(false);
    setAnonymous(true);
    setShareResults(true);
    setFormError(null);
    setShowCreateForm(false);
  };

  const handleSavePoll = async (launchNow = false) => {
    setFormError(null);
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setFormError('Question is required');
      return;
    }
    if (trimmedQuestion.length > 200) {
      setFormError('Question must be at most 200 characters');
      return;
    }

    const trimmedOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (trimmedOptions.length < 2) {
      setFormError('At least 2 non-empty options are required');
      return;
    }
    if (trimmedOptions.length > 6) {
      setFormError('A maximum of 6 options are allowed');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreatePoll?.({
        question: trimmedQuestion,
        options: trimmedOptions.map((opt) => (typeof opt === 'string' ? { text: opt } : opt)),
        multiple,
        anonymous,
        shareResults,
        launchNow,
      });
      resetForm();
    } catch (err) {
      setFormError(err?.message || 'Failed to save poll');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportCsv = async (pollId) => {
    if (!meetingCode || !pollId) return;
    try {
      await exportPollCsv(meetingCode, pollId);
    } catch (err) {
      console.error('Failed to export CSV:', err);
    }
  };

  const handleToggleOptionSelection = (optionId) => {
    if (activePoll?.multiple) {
      setSelectedOptionIds((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      );
    } else {
      setSelectedOptionIds([optionId]);
    }
  };

  const handleParticipantVote = async () => {
    if (!activePoll || selectedOptionIds.length === 0) return;
    setVoteError(null);
    setVoteSubmitting(true);
    try {
      await onSubmitVote?.(activePoll.id, selectedOptionIds);
    } catch (err) {
      setVoteError(err?.message || 'Failed to submit vote');
    } finally {
      setVoteSubmitting(false);
    }
  };

  const isFormActive = showCreateForm || (!activePoll && canModerate);

  return (
    <aside
      className={`chat-panel polls-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Meeting polls"
      aria-hidden={!isOpen}
    >
      <header className="call-panel__header">
        <nav className="call-panel__tabs" role="tablist" aria-label="Meeting panels">
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="call-panel__tab"
            onClick={onSwitchToParticipants}
          >
            Participants ({participantCount})
            {waitingCount > 0 && (
              <span className="call-panel__tab-badge call-panel__tab-badge--waiting">
                {waitingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="call-panel__tab"
            onClick={onSwitchToChat}
          >
            Chat
            {unreadCount > 0 && (
              <span className="call-panel__tab-badge">{unreadCount}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={true}
            className="call-panel__tab is-active"
          >
            Polls
          </button>
        </nav>
        <Tooltip label="Close panel" side="left">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Close polls panel"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </Tooltip>
      </header>

      <div className="polls-panel__body">
        {/* Host/Moderator Poll Management */}
        {canModerate && isFormActive ? (
          <div className="polls-create-form">
            <div className="polls-create-form__header">
              <h3 className="polls-create-form__title">Create a Poll</h3>
              {activePoll && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
              )}
            </div>

            {formError && (
              <div className="polls-alert polls-alert--error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className="polls-form-group">
              <div className="polls-form-group__label-row">
                <label htmlFor="poll-question-input" className="polls-form-label">
                  Question
                </label>
                <span className="polls-char-count">{question.length}/200</span>
              </div>
              <textarea
                id="poll-question-input"
                className="polls-input polls-textarea"
                placeholder="Ask a question..."
                maxLength={200}
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <div className="polls-form-group">
              <label className="polls-form-label">Options (2 to 6)</label>
              <div className="polls-options-list">
                {options.map((opt, idx) => (
                  <div key={idx} className="polls-option-row">
                    <span className="polls-option-number">{idx + 1}.</span>
                    <input
                      type="text"
                      className="polls-input polls-option-input"
                      placeholder={`Option ${idx + 1}`}
                      maxLength={100}
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      disabled={options.length <= 2}
                      onClick={() => handleRemoveOption(idx)}
                      aria-label={`Remove option ${idx + 1}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>

              {options.length < 6 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="polls-add-opt-btn"
                  leftIcon={Plus}
                  onClick={handleAddOption}
                >
                  Add Option
                </Button>
              )}
            </div>

            <div className="polls-settings-group">
              <label className="polls-checkbox-label">
                <input
                  type="checkbox"
                  checked={multiple}
                  onChange={(e) => setMultiple(e.target.checked)}
                />
                <span>Allow multiple answers</span>
              </label>

              <label className="polls-checkbox-label">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                <span>Anonymous voting (voter identities never exposed)</span>
              </label>

              <label className="polls-checkbox-label">
                <input
                  type="checkbox"
                  checked={shareResults}
                  onChange={(e) => setShareResults(e.target.checked)}
                />
                <span>Share results with participants after poll closes</span>
              </label>
            </div>

            <div className="polls-create-form__actions">
              <Button
                variant="secondary"
                disabled={isSubmitting || !question.trim()}
                onClick={() => handleSavePoll(false)}
              >
                Save as Draft
              </Button>
              <Button
                variant="primary"
                leftIcon={Play}
                disabled={isSubmitting || !question.trim()}
                onClick={() => handleSavePoll(true)}
              >
                Launch Poll
              </Button>
            </div>
          </div>
        ) : canModerate && activePoll ? (
          <div className="polls-card">
            <div className="polls-card__status-bar">
              <div className="polls-card__badges">
                <Badge
                  variant={
                    activePoll.status === 'open'
                      ? 'success'
                      : activePoll.status === 'draft'
                      ? 'neutral'
                      : 'secondary'
                  }
                >
                  {activePoll.status === 'open'
                    ? 'Live'
                    : activePoll.status === 'draft'
                    ? 'Draft'
                    : 'Closed'}
                </Badge>
                {activePoll.anonymous ? (
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
                {activePoll.multiple && <Badge variant="neutral">Multiple choice</Badge>}
              </div>

              <div className="polls-card__top-actions">
                {isHost && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={Download}
                    onClick={() => handleExportCsv(activePoll.id)}
                    title="Export votes to CSV"
                  >
                    CSV
                  </Button>
                )}
              </div>
            </div>

            <h3 className="polls-card__question">{activePoll.question}</h3>

            <div className="polls-card__results" role="region" aria-label="Poll results">
              {(activePoll.options || []).map((opt) => (
                <PollResultBar
                  key={opt.id}
                  option={opt}
                  totalVotes={activePoll.totalVotes || 0}
                  isUserVote={activePoll.userVote?.includes(opt.id)}
                />
              ))}
            </div>

            <div className="polls-card__meta">
              <span>Total votes: {activePoll.totalVotes || 0}</span>
              {activePoll.shareResults && <span>• Participants will see results when closed</span>}
            </div>

            <div className="polls-card__controls">
              {activePoll.status === 'draft' && (
                <Button
                  variant="primary"
                  leftIcon={Play}
                  onClick={() => onLaunchPoll?.(activePoll.id)}
                >
                  Launch Poll
                </Button>
              )}
              {activePoll.status === 'open' && (
                <Button
                  variant="danger"
                  leftIcon={Square}
                  onClick={() => onClosePoll?.(activePoll.id)}
                >
                  Close Poll
                </Button>
              )}
              {activePoll.status === 'closed' && (
                <Button
                  variant="primary"
                  leftIcon={Plus}
                  onClick={() => setShowCreateForm(true)}
                >
                  Create New Poll
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Participant View */
          <div className="polls-participant-view">
            {!activePoll ? (
              <div className="polls-empty" role="status">
                <BarChart2 size={36} aria-hidden="true" className="polls-empty__icon" />
                <h4 className="polls-empty__title">No active poll</h4>
                <p className="polls-empty__text">
                  When a host launches a poll, it will appear here for you to vote.
                </p>
              </div>
            ) : activePoll.status === 'open' ? (
              <div className="polls-voting-card">
                <div className="polls-voting-card__header">
                  <Badge variant="success">Live Poll</Badge>
                  {activePoll.anonymous ? (
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
                  {activePoll.multiple && <Badge variant="neutral">Select multiple</Badge>}
                </div>

                <h3 className="polls-voting-card__question">{activePoll.question}</h3>

                {voteError && (
                  <div className="polls-alert polls-alert--error" role="alert">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{voteError}</span>
                  </div>
                )}

                {activePoll.hasVoted ? (
                  <div className="polls-voted-confirmation" role="status">
                    <CheckCircle2 size={24} className="polls-voted-icon" aria-hidden="true" />
                    <h4 className="polls-voted-title">Thank you for voting!</h4>
                    <p className="polls-voted-subtitle">
                      Your response has been recorded.{' '}
                      {activePoll.shareResults
                        ? 'Results will be shared once the host closes the poll.'
                        : 'Results are kept private by the host.'}
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleParticipantVote();
                    }}
                  >
                    <div
                      className="polls-options-select-list"
                      role={activePoll.multiple ? 'group' : 'radiogroup'}
                      aria-label={activePoll.question}
                    >
                      {(activePoll.options || []).map((opt) => {
                        const isSelected = selectedOptionIds.includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={`polls-option-choice ${
                              isSelected ? 'is-selected' : ''
                            }`}
                          >
                            <input
                              type={activePoll.multiple ? 'checkbox' : 'radio'}
                              name={`poll-${activePoll.id}`}
                              value={opt.id}
                              checked={isSelected}
                              onChange={() => handleToggleOptionSelection(opt.id)}
                            />
                            <span className="polls-option-choice__text">{opt.text}</span>
                          </label>
                        );
                      })}
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      className="polls-submit-vote-btn"
                      disabled={selectedOptionIds.length === 0 || voteSubmitting}
                    >
                      {voteSubmitting ? 'Submitting...' : 'Submit Vote'}
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              /* activePoll status is closed */
              <div className="polls-closed-card">
                <div className="polls-closed-card__header">
                  <Badge variant="secondary">Poll Closed</Badge>
                </div>

                <h3 className="polls-closed-card__question">{activePoll.question}</h3>

                {activePoll.shareResults ? (
                  <div className="polls-card__results" role="region" aria-label="Final poll results">
                    {(activePoll.options || []).map((opt) => (
                      <PollResultBar
                        key={opt.id}
                        option={opt}
                        totalVotes={activePoll.totalVotes || 0}
                        isUserVote={activePoll.userVote?.includes(opt.id)}
                      />
                    ))}
                    <div className="polls-card__meta">
                      <span>Total votes: {activePoll.totalVotes || 0}</span>
                    </div>
                  </div>
                ) : (
                  <div className="polls-empty" role="status">
                    <p className="polls-empty__text">
                      This poll has ended. The host chose not to share results.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
