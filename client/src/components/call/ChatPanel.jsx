import { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';

import Button from '../ui/Button.jsx';
import Tooltip from '../ui/Tooltip.jsx';

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
  participantCount = 1,
  waitingCount = 0,
  messages = [],
  currentUser,
  historyLoading = false,
  historyError = null,
  rateLimitHint = null,
  onSendMessage,
  onRetryMessage,
  onRetryLoadHistory,
}) {
  const [inputText, setInputText] = useState('');
  const [showNewPill, setShowNewPill] = useState(false);
  const listRef = useRef(null);
  const textareaRef = useRef(null);
  const isNearBottomRef = useRef(true);

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
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Group messages: consecutive from same user within 2 minutes
  const grouped = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.isSystem) {
      grouped.push({ type: 'system', message: m });
      continue;
    }

    const prev = i > 0 ? messages[i - 1] : null;
    const isSelf =
      currentUser?.id && m.from?.id ? String(m.from.id) === String(currentUser.id) : false;

    let isFirstInGroup = true;
    if (
      prev &&
      !prev.isSystem &&
      prev.from?.id &&
      m.from?.id &&
      String(prev.from.id) === String(m.from.id)
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

          {!historyLoading && messages.length === 0 && (
            <div className="chat-panel__empty" role="status">
              <p className="chat-panel__empty-title">No messages yet</p>
              <p className="chat-panel__empty-subtitle">Messages are saved with this meeting</p>
            </div>
          )}

          {grouped.map((item) => {
            if (item.type === 'system') {
              return (
                <div key={item.message.id} className="chat-system-line">
                  {item.message.text}
                </div>
              );
            }

            const { message, isSelf, isFirstInGroup, time, senderName } = item;
            const isSending = message.status === 'sending';
            const isFailed = message.status === 'failed';

            return (
              <div
                key={message.id || message.tempId}
                className={`chat-group ${isSelf ? 'chat-group--self' : 'chat-group--other'} ${
                  isFirstInGroup ? 'chat-group--first' : 'chat-group--tight'
                }`}
              >
                {isFirstInGroup && (
                  <div className="chat-group__meta">
                    {!isSelf && <span className="chat-group__name">{senderName}</span>}
                    <span className="chat-group__time">{time}</span>
                  </div>
                )}

                <div
                  className={`chat-bubble ${isSelf ? 'chat-bubble--self' : 'chat-bubble--other'} ${
                    isSending ? 'chat-bubble--sending' : ''
                  } ${isFailed ? 'chat-bubble--failed' : ''}`}
                >
                  <p className="chat-bubble__text">{message.text}</p>
                </div>

                {isFailed && (
                  <div className="chat-bubble__failure">
                    <span className="chat-bubble__failure-text">Message not sent</span>
                    <button
                      type="button"
                      className="chat-bubble__retry-btn"
                      onClick={() => onRetryMessage(message.id || message.tempId)}
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
        <div className="chat-panel__input-wrapper">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Send a message…"
            aria-label="Send a message"
            className="chat-panel__textarea"
            maxLength={1000}
          />
          {inputText.length > 900 && (
            <span className="chat-panel__char-counter" aria-live="polite">
              {inputText.length}/1000
            </span>
          )}
        </div>

        <Tooltip label="Send message" side="top">
          <Button
            type="submit"
            variant="primary"
            size="md"
            iconOnly
            disabled={!inputText.trim()}
            aria-label="Send message"
            className="chat-panel__send-btn"
          >
            <Send size={18} aria-hidden="true" />
          </Button>
        </Tooltip>

        {rateLimitHint && (
          <div className="chat-panel__rate-limit-hint" role="alert">
            {rateLimitHint}
          </div>
        )}
      </form>
    </aside>
  );
}
