import { useEffect, useRef, useState } from 'react';
import { Send, X, Lock, AlertCircle, Search, Reply, Copy, Check, Smile } from 'lucide-react';

import Button from '../ui/Button.jsx';
import Tooltip from '../ui/Tooltip.jsx';
import { useFeature } from '../../hooks/useFeature.js';

const EMOJI_LIST = [
  '😀', '😂', '😊', '😍', '👍', '👏', '🎉', '❤️',
  '🔥', '🚀', '💡', '✨', '💯', '✅', '🙏', '🤝',
  '🙌', '😎', '🤔', '🥳'
];

/**
 * Automatically detects http:// and https:// URLs in text and renders them as
 * secure anchor tags with rel="noopener noreferrer" and target="_blank".
 * All other content is rendered as plain text (never innerHTML).
 */
export function renderMessageText(text) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  if (parts.length === 1) return text;
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-bubble__link"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export default function ChatPanel({
  isOpen,
  onClose,
  onSwitchToParticipants,
  onSwitchToPolls,
  participantCount = 1,
  waitingCount = 0,
  messages = [],
  currentUser,
  peers = [],
  historyLoading = false,
  historyError = null,
  rateLimitHint = null,
  chatAllowed = true,
  canModerate = false,
  initialRecipient = null,
  onSendMessage,
  onRetryMessage,
  onRetryLoadHistory,
}) {
  const [inputText, setInputText] = useState('');
  const [showNewPill, setShowNewPill] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState(() => initialRecipient?.id || '');
  const [selectedRecipientName, setSelectedRecipientName] = useState(() => initialRecipient?.name || '');
  const [replyingTo, setReplyingTo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const pollsEnabled = useFeature('POLLS');
  const chatPlusEnabled = useFeature('CHAT_PLUS');

  const listRef = useRef(null);
  const textareaRef = useRef(null);
  const isNearBottomRef = useRef(true);

  // Derive admitted other participants for the To: dropdown
  const admittedRecipients = [];
  const seenIds = new Set();
  for (const p of peers) {
    const uId = p.user?.id;
    if (!uId) continue;
    if (currentUser?.id && String(uId) === String(currentUser.id)) continue;
    if (seenIds.has(String(uId))) continue;
    seenIds.add(String(uId));
    admittedRecipients.push({
      id: String(uId),
      name: p.user.name || 'Guest',
      isHost: Boolean(p.isHost || p.user.isHost),
    });
  }

  const isPrivate = Boolean(selectedRecipientId);
  const matchedRecipient = admittedRecipients.find((r) => r.id === selectedRecipientId);
  const hasLeft = isPrivate && !matchedRecipient;
  const activeRecipientName = matchedRecipient ? matchedRecipient.name : selectedRecipientName;

  const handleRecipientChange = (e) => {
    const newId = e.target.value;
    setSelectedRecipientId(newId);
    if (newId) {
      const found = admittedRecipients.find((r) => r.id === newId);
      if (found) {
        setSelectedRecipientName(found.name);
      }
    } else {
      setSelectedRecipientName('');
    }
  };

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 60;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setShowNewPill(false);
    }
  };

  useEffect(() => {
    if (!listRef.current) return;
    if (isNearBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    } else {
      setShowNewPill(true);
    }
  }, [messages]);

  const scrollToBottom = () => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    setShowNewPill(false);
  };

  const handleInput = (e) => {
    setInputText(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const lineHeight = 20;
      const maxHeight = lineHeight * 4 + 16;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (hasLeft) return;
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const recipientPayload = isPrivate
      ? { id: selectedRecipientId, name: activeRecipientName }
      : null;
    const replyToPayload = chatPlusEnabled && replyingTo
      ? { id: replyingTo.id, text: replyingTo.text, fromName: replyingTo.fromName }
      : null;

    onSendMessage(trimmed, recipientPayload, replyToPayload);
    setInputText('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleStartReply = (msg) => {
    const isSelf =
      currentUser?.id && msg.from?.id ? String(msg.from.id) === String(currentUser.id) : false;
    setReplyingTo({
      id: msg.id || msg.tempId,
      text: msg.text,
      fromName: isSelf ? 'You' : msg.from?.name || 'Guest',
    });
    textareaRef.current?.focus();
  };

  const handleCopyMessage = async (text, id) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // ignore clipboard error in restricted environments
    }
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr));
    }, 2000);
  };

  const handleInsertEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  // Filter messages
  const userMessages = messages.filter((m) => !m.isSystem);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleMessages = chatPlusEnabled && normalizedQuery
    ? userMessages.filter((m) => {
        const textMatch = (m.text || '').toLowerCase().includes(normalizedQuery);
        const senderMatch = (m.from?.name || '').toLowerCase().includes(normalizedQuery);
        return textMatch || senderMatch;
      })
    : userMessages;

  // Group visible messages
  const grouped = [];
  for (let i = 0; i < visibleMessages.length; i++) {
    const m = visibleMessages[i];
    const prev = i > 0 ? visibleMessages[i - 1] : null;
    const isSelf =
      currentUser?.id && m.from?.id ? String(m.from.id) === String(currentUser.id) : false;

    let isFirstInGroup = true;
    if (
      prev &&
      !prev.isSystem &&
      prev.from?.id &&
      m.from?.id &&
      String(prev.from.id) === String(m.from.id) &&
      Boolean(prev.to) === Boolean(m.to) &&
      (prev.to?.id || null) === (m.to?.id || null) &&
      !m.replyTo
    ) {
      const prevTime = new Date(prev.createdAt).getTime();
      const currTime = new Date(m.createdAt).getTime();
      if (!isNaN(prevTime) && !isNaN(currTime) && currTime - prevTime < 2 * 60 * 1000) {
        isFirstInGroup = false;
      }
    }

    grouped.push({
      type: 'chat',
      message: m,
      isSelf,
      isFirstInGroup,
      time: formatTime(m.createdAt),
      senderName: isSelf ? 'You' : m.from?.name || 'Guest',
    });
  }

  return (
    <aside
      className={`chat-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Meeting chat"
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
            aria-selected={true}
            className="call-panel__tab is-active"
          >
            Chat
          </button>
          {pollsEnabled && (
            <button
              type="button"
              role="tab"
              aria-selected={false}
              className="call-panel__tab"
              onClick={onSwitchToPolls}
            >
              Polls
            </button>
          )}
        </nav>
        <Tooltip label="Close panel" side="left">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Close chat panel"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </Tooltip>
      </header>

      {chatPlusEnabled && (
        <div className="chat-panel__search-bar">
          <Search size={14} className="chat-panel__search-icon" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in chat…"
            aria-label="Search messages"
            className="chat-panel__search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="chat-panel__search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {chatPlusEnabled && normalizedQuery && (
        <div className="chat-panel__search-results-info" role="status">
          Found {visibleMessages.length} {visibleMessages.length === 1 ? 'message' : 'messages'}
        </div>
      )}

      <div className="chat-panel__body">
        {historyError && (
          <div className="chat-panel__history-error" role="status">
            <span>{historyError}</span>
            <button
              type="button"
              onClick={onRetryLoadHistory}
              className="chat-panel__retry-link"
            >
              Try again
            </button>
          </div>
        )}

        <div
          ref={listRef}
          className="chat-panel__messages"
          role="log"
          aria-live="polite"
          onScroll={handleScroll}
        >
          {historyLoading && (
            <div className="chat-panel__skeletons" aria-label="Loading earlier messages">
              <div className="chat-skeleton chat-skeleton--left" />
              <div className="chat-skeleton chat-skeleton--right" />
              <div className="chat-skeleton chat-skeleton--left" />
            </div>
          )}

          {!historyLoading && visibleMessages.length === 0 && (
            <div className="chat-panel__empty" role="status">
              <p className="chat-panel__empty-title">
                {normalizedQuery ? 'No matching messages' : 'No messages yet'}
              </p>
              <p className="chat-panel__empty-subtitle">
                {normalizedQuery
                  ? `No messages matched "${searchQuery}"`
                  : 'Messages are saved with this meeting'}
              </p>
            </div>
          )}

          {grouped.map((item) => {
            const { message, isSelf, isFirstInGroup, time } = item;
            const isSending = message.status === 'sending';
            const isFailed = message.status === 'failed';
            const isMsgPrivate = Boolean(message.to);
            const msgId = message.id || message.tempId;

            return (
              <div
                key={msgId}
                className={`chat-group ${isSelf ? 'chat-group--self' : 'chat-group--other'} ${
                  isFirstInGroup ? 'chat-group--first' : 'chat-group--tight'
                }`}
              >
                {isFirstInGroup && (
                  <div className="chat-group__meta">
                    {!isSelf && (
                      <span className="chat-group__name">
                        {message.from?.name || 'Guest'}
                        {message.from?.isHost && (
                          <span className="chat-group__host-label"> (Host)</span>
                        )}
                      </span>
                    )}
                    <span className="chat-group__time">{time}</span>
                  </div>
                )}

                <div
                  className={`chat-bubble ${isSelf ? 'chat-bubble--self' : 'chat-bubble--other'} ${
                    isMsgPrivate ? 'chat-bubble--private' : ''
                  } ${isMsgPrivate && isSelf ? 'chat-bubble--private-self' : ''} ${
                    isMsgPrivate && !isSelf ? 'chat-bubble--private-other' : ''
                  } ${isSending ? 'chat-bubble--sending' : ''} ${
                    isFailed ? 'chat-bubble--failed' : ''
                  }`}
                >
                  {isMsgPrivate && (
                    <div className="chat-bubble__private-tag">
                      <Lock size={11} aria-hidden="true" />
                      <span>
                        {isSelf
                          ? `Private to ${message.to?.name || 'User'}`
                          : `Private from ${message.from?.name || 'Guest'}`}
                      </span>
                    </div>
                  )}

                  {message.replyTo && (
                    <div
                      className="chat-bubble__reply-quote"
                      aria-label={`In reply to ${message.replyTo.fromName || 'Guest'}`}
                    >
                      <div className="chat-bubble__reply-quote-sender">
                        {message.replyTo.fromName || 'Guest'}
                      </div>
                      <div className="chat-bubble__reply-quote-text">
                        {message.replyTo.text}
                      </div>
                    </div>
                  )}

                  <p className="chat-bubble__text">{renderMessageText(message.text)}</p>
                </div>

                {chatPlusEnabled && !isSending && !isFailed && (
                  <div className="chat-bubble__actions" role="toolbar" aria-label="Message actions">
                    <button
                      type="button"
                      className="chat-bubble__action-btn"
                      title="Reply"
                      aria-label="Reply to message"
                      onClick={() => handleStartReply(message)}
                    >
                      <Reply size={12} aria-hidden="true" />
                      <span className="chat-bubble__action-text">Reply</span>
                    </button>
                    <button
                      type="button"
                      className="chat-bubble__action-btn"
                      title="Copy message"
                      aria-label="Copy message text"
                      onClick={() => handleCopyMessage(message.text, msgId)}
                    >
                      {copiedId === msgId ? (
                        <>
                          <Check size={12} aria-hidden="true" />
                          <span className="chat-bubble__action-text">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} aria-hidden="true" />
                          <span className="chat-bubble__action-text">Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {isFailed && (
                  <div className="chat-bubble__failure">
                    <span className="chat-bubble__failure-text">Message not sent</span>
                    <button
                      type="button"
                      className="chat-bubble__retry-btn"
                      onClick={() => onRetryMessage(msgId)}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showNewPill && (
          <button
            type="button"
            className="chat-panel__new-pill"
            onClick={scrollToBottom}
            aria-label="Scroll to new messages"
          >
            New messages ↓
          </button>
        )}
      </div>

      <form className="chat-panel__input-area" onSubmit={handleSubmit}>
        <div className="chat-panel__recipient-bar">
          <label htmlFor="chat-recipient-select" className="chat-panel__recipient-label">
            To:
          </label>
          <select
            id="chat-recipient-select"
            className="chat-panel__recipient-select"
            value={selectedRecipientId}
            onChange={handleRecipientChange}
            aria-label="Select chat recipient"
          >
            <option value="">Everyone</option>
            {admittedRecipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isHost ? ' (Host)' : ''}
              </option>
            ))}
            {hasLeft && (
              <option value={selectedRecipientId} disabled>
                {activeRecipientName} (left)
              </option>
            )}
          </select>
        </div>

        {isPrivate && (
          <div
            className={`chat-panel__privacy-banner ${
              hasLeft ? 'chat-panel__privacy-banner--left' : ''
            }`}
            role="status"
          >
            {hasLeft ? (
              <>
                <AlertCircle size={13} aria-hidden="true" className="chat-panel__privacy-icon" />
                <span>{activeRecipientName} left the meeting</span>
              </>
            ) : (
              <>
                <Lock size={13} aria-hidden="true" className="chat-panel__privacy-icon" />
                <span>Only you and {activeRecipientName} can see this</span>
              </>
            )}
          </div>
        )}

        {!chatAllowed && !canModerate && (
          <div className="chat-panel__privacy-banner chat-panel__privacy-banner--disabled" role="status">
            <Lock size={13} aria-hidden="true" className="chat-panel__privacy-icon" />
            <span>Chat has been disabled by the meeting host</span>
          </div>
        )}

        {chatPlusEnabled && replyingTo && (
          <div
            className="chat-panel__reply-chip"
            role="status"
            aria-label={`Replying to ${replyingTo.fromName}`}
          >
            <div className="chat-panel__reply-chip-content">
              <Reply size={13} className="chat-panel__reply-icon" aria-hidden="true" />
              <div className="chat-panel__reply-chip-text">
                <span className="chat-panel__reply-target">Replying to {replyingTo.fromName}:</span>
                <span className="chat-panel__reply-snippet">
                  {replyingTo.text.length > 50 ? `${replyingTo.text.slice(0, 50)}…` : replyingTo.text}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="chat-panel__reply-cancel-btn"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="chat-panel__input-row">
          <div className="chat-panel__input-wrapper">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={
                !chatAllowed && !canModerate
                  ? 'Chat is disabled by the host'
                  : hasLeft
                  ? `${activeRecipientName} left the meeting`
                  : isPrivate
                  ? `Private message to ${activeRecipientName}`
                  : 'Send a message…'
              }
              aria-label={
                !chatAllowed && !canModerate
                  ? 'Chat is disabled by the host'
                  : hasLeft
                  ? `${activeRecipientName} left the meeting`
                  : isPrivate
                  ? `Private message to ${activeRecipientName}`
                  : 'Send a message'
              }
              className="chat-panel__textarea"
              maxLength={1000}
              disabled={hasLeft || (!chatAllowed && !canModerate)}
            />
            {inputText.length > 900 && (
              <span className="chat-panel__char-counter" aria-live="polite">
                {inputText.length}/1000
              </span>
            )}
          </div>

          {chatPlusEnabled && (
            <div className="chat-panel__emoji-wrapper">
              <Tooltip label="Insert emoji" side="top">
                <button
                  type="button"
                  className={`chat-panel__emoji-btn ${showEmojiPicker ? 'is-active' : ''}`}
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                  aria-label="Insert emoji"
                  aria-expanded={showEmojiPicker}
                  disabled={hasLeft || (!chatAllowed && !canModerate)}
                >
                  <Smile size={18} aria-hidden="true" />
                </button>
              </Tooltip>
              {showEmojiPicker && (
                <div className="chat-panel__emoji-popover" role="dialog" aria-label="Emoji picker">
                  <div className="chat-panel__emoji-grid">
                    {EMOJI_LIST.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="chat-panel__emoji-item"
                        onClick={() => handleInsertEmoji(emoji)}
                        aria-label={`Insert emoji ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Tooltip label="Send message" side="top">
            <Button
              type="submit"
              variant="primary"
              size="md"
              iconOnly
              disabled={!inputText.trim() || hasLeft || (!chatAllowed && !canModerate)}
              aria-label="Send message"
              className="chat-panel__send-btn"
            >
              <Send size={18} aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>

        {rateLimitHint && (
          <div className="chat-panel__rate-limit-hint" role="alert">
            {rateLimitHint}
          </div>
        )}
      </form>
    </aside>
  );
}
