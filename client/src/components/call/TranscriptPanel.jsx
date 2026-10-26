import {
  Captions,
  Download,
  FileText,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Tooltip from '../ui/Tooltip.jsx';

function formatOffset(offsetMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(offsetMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function TranscriptPanel({
  isOpen,
  onClose,
  onSwitchToParticipants,
  onSwitchToChat,
  onSwitchToPolls,
  participantCount = 1,
  waitingCount = 0,
  unreadCount = 0,
  transcript = [],
  liveCaption = null,
  captionsActive = false,
  onToggleCaptions = null,
  meetingCode = '',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef(null);
  const userScrolledUpRef = useRef(false);

  // Filter transcript segments by search query
  const filteredTranscript = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transcript;
    return transcript.filter(
      (item) =>
        item.name?.toLowerCase().includes(q) ||
        item.text?.toLowerCase().includes(q)
    );
  }, [transcript, searchQuery]);

  // Handle auto-scrolling to bottom on new segments if user hasn't scrolled up
  useEffect(() => {
    if (!scrollRef.current || userScrolledUpRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript.length, liveCaption?.text]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // If within 60px of bottom, consider user pinned to bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    userScrolledUpRef.current = !isAtBottom;
  };

  const handleDownloadTxt = () => {
    if (!transcript.length) return;
    const dateStr = new Date().toLocaleString();
    const lines = [
      `Meeting Transcript: ${meetingCode}`,
      `Exported: ${dateStr}`,
      `Total Segments: ${transcript.length}`,
      '==================================================',
      '',
    ];

    transcript.forEach((item) => {
      const time = formatOffset(item.offsetMs);
      const speaker = item.name || 'Speaker';
      lines.push(`[${time}] ${speaker}: ${item.text}`);
    });

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${meetingCode || 'meeting'}-transcript.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <aside
      className={`chat-panel transcript-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Meeting transcript"
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
          {onSwitchToPolls && (
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
          <button
            type="button"
            role="tab"
            aria-selected={true}
            className="call-panel__tab is-active"
          >
            Transcript
          </button>
        </nav>
        <Tooltip label="Close panel" side="left">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Close transcript panel"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </Tooltip>
      </header>

      {/* Subheader with search, count, and download */}
      <div className="transcript-panel__toolbar">
        <div className="transcript-panel__search-wrap">
          <Search size={14} className="transcript-panel__search-icon" aria-hidden="true" />
          <input
            type="text"
            className="transcript-panel__search-input"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search transcript"
          />
          {searchQuery && (
            <button
              type="button"
              className="transcript-panel__search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="transcript-panel__actions">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={Download}
            disabled={transcript.length === 0}
            onClick={handleDownloadTxt}
            title="Download transcript as .txt"
          >
            Download .txt
          </Button>
        </div>
      </div>

      {/* Main transcript scroll area */}
      <div
        className="transcript-panel__body"
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
      >
        {filteredTranscript.length === 0 && !liveCaption ? (
          <div className="transcript-panel__empty">
            <FileText size={36} className="transcript-panel__empty-icon" aria-hidden="true" />
            <h4 className="transcript-panel__empty-title">
              {searchQuery ? 'No matching segments' : 'No transcript recorded yet'}
            </h4>
            <p className="transcript-panel__empty-desc">
              {searchQuery
                ? 'Try searching for different keywords or speaker names.'
                : 'Turn on live captions to start transcribing microphone audio into the meeting transcript.'}
            </p>
            {onToggleCaptions && !captionsActive && !searchQuery && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={Captions}
                onClick={onToggleCaptions}
              >
                Turn On Captions
              </Button>
            )}
          </div>
        ) : (
          <div className="transcript-panel__list">
            {filteredTranscript.map((item) => (
              <article key={item.id} className="transcript-item">
                <div className="transcript-item__header">
                  <span className="transcript-item__speaker">
                    {item.name || 'Speaker'}
                  </span>
                  <span className="transcript-item__time">
                    {formatOffset(item.offsetMs)}
                  </span>
                </div>
                <p className="transcript-item__text">{item.text}</p>
              </article>
            ))}

            {/* Distinguish live interim captions from saved transcript */}
            {liveCaption && !liveCaption.final && (
              <article className="transcript-item transcript-item--live" aria-live="assertive">
                <div className="transcript-item__header">
                  <span className="transcript-item__speaker">
                    {liveCaption.name || 'Speaker'}
                  </span>
                  <span className="transcript-item__live-tag">
                    <span className="transcript-item__live-dot" />
                    Transcribing...
                  </span>
                </div>
                <p className="transcript-item__text transcript-item__text--live">
                  {liveCaption.text}
                </p>
              </article>
            )}
          </div>
        )}
      </div>

      {/* Footer status notice */}
      <footer className="transcript-panel__footer">
        <span className="transcript-panel__footer-note">
          {captionsActive
            ? 'Captions active • Microphone audio is transcribed via Web Speech API'
            : 'Captions off • Toggle in toolbar to resume transcription'}
        </span>
      </footer>
    </aside>
  );
}
