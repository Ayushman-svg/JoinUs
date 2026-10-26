import { ArrowLeft, BarChart2, Calendar, Captions, Clock, Copy, Download, Eye, EyeOff, Lock, MessageSquare, ShieldAlert, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { exportPollCsv, getHistoryDetail, getMeetingCaptions, getMeetingMessages, getMeetingPolls } from '../api/meetings.js';
import PollResultBar from '../components/call/PollResultBar.jsx';
import { useFeature } from '../hooks/useFeature.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime, formatDuration } from '../lib/datetime.js';

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export default function HistoryDetailPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const pollsEnabled = useFeature('POLLS');
  const captionsEnabled = useFeature('CAPTIONS');

  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState(null);
  const [messages, setMessages] = useState([]);
  const [polls, setPolls] = useState([]);
  const [captions, setCaptions] = useState([]);
  const [activeTab, setActiveTab] = useState('chat');
  const [isForbidden, setIsForbidden] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setIsForbidden(false);

    try {
      const promises = [
        getHistoryDetail(code),
        getMeetingMessages(code, 200),
      ];
      if (pollsEnabled) {
        promises.push(getMeetingPolls(code).catch(() => []));
      }
      if (captionsEnabled) {
        promises.push(getMeetingCaptions(code).catch(() => []));
      }
      const results = await Promise.all(promises);
      const detailData = results[0];
      const messagesData = results[1];
      let nextIdx = 2;
      let pollsData = [];
      let captionsData = [];
      if (pollsEnabled) {
        pollsData = results[nextIdx++];
      }
      if (captionsEnabled) {
        captionsData = results[nextIdx++];
      }

      setMeeting(detailData);
      setMessages(messagesData || []);
      if (pollsData) {
        setPolls(pollsData);
      }
      if (captionsData) {
        setCaptions(captionsData);
      }
      setLoading(false);
    } catch (err) {
      if (err?.status === 403 || err?.code === 'FORBIDDEN') {
        setIsForbidden(true);
      } else {
        setError(err?.message || 'Failed to load meeting history');
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [code, pollsEnabled, captionsEnabled]);

  const handleExportCsv = async (pollId) => {
    try {
      await exportPollCsv(code, pollId);
      toast({
        title: 'Poll CSV downloaded',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Failed to download CSV',
        description: err?.message || 'Please try again',
        variant: 'error',
      });
    }
  };

  const handleCopyTranscript = async () => {
    if (!messages.length) return;
    const lines = messages.map((m) => {
      const time = formatTime(m.createdAt);
      const isHost = m.from?.isHost;
      const baseName = m.from?.name || 'Guest';
      const name = isHost ? `${baseName} (Host)` : baseName;
      const isSelf = user?.id && m.from?.id ? String(m.from.id) === String(user.id) : false;
      let privacyTag = '';
      if (m.to) {
        privacyTag = isSelf
          ? ` [Private to ${m.to.name || 'User'}]`
          : ` [Private from ${m.from?.name || 'Guest'}]`;
      }
      return `[${time}] ${name}${privacyTag}: ${m.text}`;
    });
    const textToCopy = lines.join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({
        title: 'Transcript copied to clipboard',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Failed to copy transcript',
        description: 'Please try again',
        variant: 'error',
      });
    }
  };

  const handleDownloadCaptionsTxt = () => {
    if (!captions.length) return;
    const lines = [
      `Meeting Spoken Transcript: ${meeting?.title || code}`,
      `Meeting Code: ${code}`,
      `Date: ${formatDateTime(meeting?.startsAt)}`,
      `Total Segments: ${captions.length}`,
      '==================================================',
      '',
    ];
    captions.forEach((c) => {
      const offsetSeconds = Math.max(0, Math.floor((c.offsetMs || 0) / 1000));
      const mins = String(Math.floor(offsetSeconds / 60)).padStart(2, '0');
      const secs = String(offsetSeconds % 60).padStart(2, '0');
      lines.push(`[+${mins}:${secs}] ${c.name || 'Speaker'}: ${c.text}`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${code}-spoken-transcript.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopySpokenTranscript = async () => {
    if (!captions.length) return;
    const textToCopy = captions
      .map((c) => {
        const offsetSeconds = Math.max(0, Math.floor((c.offsetMs || 0) / 1000));
        const mins = String(Math.floor(offsetSeconds / 60)).padStart(2, '0');
        const secs = String(offsetSeconds % 60).padStart(2, '0');
        return `[+${mins}:${secs}] ${c.name || 'Speaker'}: ${c.text}`;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({
        title: 'Spoken transcript copied to clipboard',
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Failed to copy transcript',
        variant: 'error',
      });
    }
  };

  if (isForbidden) {
    return (
      <div className="history-detail-page">
        <div className="ui-state ui-state--error" role="alert">
          <span className="ui-state__icon">
            <ShieldAlert size={28} aria-hidden="true" />
          </span>
          <h2 className="ui-state__title">You don't have access to this meeting's history</h2>
          <p className="ui-state__text">
            Only the host and admitted participants can view past meeting details and transcripts.
          </p>
          <div className="ui-state__actions">
            <Button variant="primary" onClick={() => navigate('/history')}>
              Back to history
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-detail-page">
        <ErrorState
          title="Couldn't load meeting history"
          description={error}
          onRetry={fetchData}
        />
      </div>
    );
  }

  // Group messages
  const grouped = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const isSelf = user?.id && m.from?.id ? String(m.from.id) === String(user.id) : false;

    let isFirstInGroup = true;
    if (
      prev &&
      prev.from?.id &&
      m.from?.id &&
      String(prev.from.id) === String(m.from.id) &&
      Boolean(prev.to) === Boolean(m.to) &&
      (prev.to?.id || null) === (m.to?.id || null)
    ) {
      const prevTime = new Date(prev.createdAt).getTime();
      const currTime = new Date(m.createdAt).getTime();
      if (!isNaN(prevTime) && !isNaN(currTime) && currTime - prevTime < 2 * 60 * 1000) {
        isFirstInGroup = false;
      }
    }

    grouped.push({
      message: m,
      isSelf,
      isFirstInGroup,
      time: formatTime(m.createdAt),
      senderName: isSelf ? 'You' : m.from?.name || 'Guest',
    });
  }

  return (
    <div className="history-detail-page">
      <div className="history-detail__back">
        <Link to="/history" className="history-detail__back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to history
        </Link>
      </div>

      {loading ? (
        <div className="history-detail__loading">
          <Skeleton width="60%" height="32px" />
          <Skeleton width="40%" height="20px" />
          <div style={{ marginTop: '24px' }}>
            <Skeleton width="100%" height="300px" />
          </div>
        </div>
      ) : (
        <>
          <header className="history-detail__header">
            <div className="history-detail__title-row">
              <h1 className="history-detail__title">{meeting?.title || 'Meeting'}</h1>
              <div className="history-detail__badges">
                {meeting?.isHost ? (
                  <Badge variant="primary">Hosted by you</Badge>
                ) : (
                  <Badge variant="neutral">Host: {meeting?.host?.name || 'Host'}</Badge>
                )}
                {meeting?.status && <StatusBadge kind={meeting.status} />}
              </div>
            </div>

            <div className="history-detail__meta">
              <span className="history-detail__meta-item">
                <Calendar size={16} aria-hidden="true" />
                {meeting?.startedAt ? formatDateTime(meeting.startedAt) : 'Not started'}
              </span>
              <span className="history-detail__meta-item">
                <Clock size={16} aria-hidden="true" />
                {formatDuration(meeting?.durationMs)}
              </span>
              <span className="history-detail__meta-item">
                <Users size={16} aria-hidden="true" />
                {meeting?.participantCount}{' '}
                {meeting?.participantCount === 1 ? 'participant' : 'participants'}
              </span>
            </div>

            {meeting?.attendees?.length > 0 && (
              <div className="history-detail__attendees" aria-label="Meeting attendees">
                <span className="history-detail__attendees-label">Attendees:</span>
                <div className="history-detail__avatar-row">
                  {meeting.attendees.map((att) => (
                    <div key={att.id} className="history-detail__attendee-chip" title={att.name}>
                      <Avatar name={att.name} size="sm" />
                      <span className="history-detail__attendee-name">{att.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </header>

          <div className="history-detail__tabs" role="tablist" aria-label="Meeting history views">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              className={`history-detail__tab ${activeTab === 'chat' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare size={16} aria-hidden="true" />
              <span>Chat transcript</span>
              <span className="history-detail__tab-badge">{messages.length}</span>
            </button>
            {pollsEnabled && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'polls'}
                className={`history-detail__tab ${activeTab === 'polls' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('polls')}
              >
                <BarChart2 size={16} aria-hidden="true" />
                <span>Polls</span>
                <span className="history-detail__tab-badge">{polls.length}</span>
              </button>
            )}
            {captionsEnabled && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'transcript'}
                className={`history-detail__tab ${activeTab === 'transcript' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('transcript')}
              >
                <Captions size={16} aria-hidden="true" />
                <span>Transcript</span>
                <span className="history-detail__tab-badge">{captions.length}</span>
              </button>
            )}
          </div>

          {activeTab === 'chat' && (
            <section className="history-detail__transcript-card" aria-label="Chat transcript">
            <div className="history-detail__transcript-header">
              <div className="history-detail__transcript-title-wrap">
                <MessageSquare size={18} aria-hidden="true" />
                <h2 className="history-detail__transcript-title">Chat transcript</h2>
                <span className="history-detail__transcript-count">
                  ({messages.length} {messages.length === 1 ? 'message' : 'messages'})
                </span>
              </div>

              {messages.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={Copy}
                  onClick={handleCopyTranscript}
                  aria-label="Copy transcript to clipboard"
                >
                  Copy transcript
                </Button>
              )}
            </div>

            <div className="history-detail__transcript-body">
              {messages.length === 0 ? (
                <div className="history-detail__empty-transcript" role="status">
                  <p>No chat messages in this meeting</p>
                </div>
              ) : (
                <div className="history-transcript__list" role="log">
                  {grouped.map((item) => {
                    const { message, isSelf, isFirstInGroup, time } = item;
                    const isMsgPrivate = Boolean(message.to);
                    return (
                      <div
                        key={message.id}
                        className={`history-bubble-group ${
                          isSelf ? 'history-bubble-group--self' : 'history-bubble-group--other'
                        } ${isFirstInGroup ? 'history-bubble-group--first' : 'history-bubble-group--tight'}`}
                      >
                        {isFirstInGroup && (
                          <div className="history-bubble-group__meta">
                            {!isSelf && (
                              <span className="history-bubble-group__name">
                                {message.from?.name || 'Guest'}
                                {message.from?.isHost && (
                                  <span className="history-bubble-group__host-label"> (Host)</span>
                                )}
                              </span>
                            )}
                            <span className="history-bubble-group__time">{time}</span>
                          </div>
                        )}

                        <div
                          className={`history-bubble ${
                            isSelf ? 'history-bubble--self' : 'history-bubble--other'
                          } ${isMsgPrivate ? 'history-bubble--private' : ''} ${
                            isMsgPrivate && isSelf ? 'history-bubble--private-self' : ''
                          } ${isMsgPrivate && !isSelf ? 'history-bubble--private-other' : ''}`}
                        >
                          {isMsgPrivate && (
                            <div className="history-bubble__private-tag">
                              <Lock size={11} aria-hidden="true" />
                              <span>
                                {isSelf
                                  ? `Private to ${message.to?.name || 'User'}`
                                  : `Private from ${message.from?.name || 'Guest'}`}
                              </span>
                            </div>
                          )}
                          <p className="history-bubble__text">{message.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          )}

          {activeTab === 'polls' && pollsEnabled && (
            <section className="history-detail__transcript-card" aria-label="Meeting polls">
              <div className="history-detail__transcript-header">
                <div className="history-detail__transcript-title-wrap">
                  <BarChart2 size={18} aria-hidden="true" />
                  <h2 className="history-detail__transcript-title">Polls</h2>
                  <span className="history-detail__transcript-count">
                    ({polls.length} {polls.length === 1 ? 'poll' : 'polls'})
                  </span>
                </div>
              </div>

              <div className="history-detail__transcript-body">
                {polls.length === 0 ? (
                  <div className="history-detail__empty-transcript" role="status">
                    <p>No polls in this meeting</p>
                  </div>
                ) : (
                  <div className="history-polls__list">
                    {polls.map((poll) => {
                      const isHostUser =
                        (meeting?.host?.id && user?.id && String(meeting.host.id) === String(user.id)) ||
                        Boolean(meeting?.isHost);

                      return (
                        <div key={poll.id} className="history-poll-item">
                          <div className="history-poll-item__header">
                            <div className="history-poll-item__badges">
                              <Badge
                                variant={
                                  poll.status === 'open'
                                    ? 'success'
                                    : poll.status === 'draft'
                                    ? 'neutral'
                                    : 'secondary'
                                }
                              >
                                {poll.status === 'open'
                                  ? 'Open'
                                  : poll.status === 'draft'
                                  ? 'Draft'
                                  : 'Closed'}
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
                              {poll.multiple && <Badge variant="neutral">Multiple choice</Badge>}
                            </div>

                            {isHostUser && (
                              <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={Download}
                                onClick={() => handleExportCsv(poll.id)}
                                aria-label="Export poll results to CSV"
                              >
                                Export CSV
                              </Button>
                            )}
                          </div>

                          <h3 className="history-poll-item__question">{poll.question}</h3>

                          <div className="history-poll-item__results" role="region" aria-label="Poll options">
                            {(poll.options || []).map((opt) => (
                              <PollResultBar
                                key={opt.id}
                                option={opt}
                                totalVotes={poll.totalVotes || 0}
                              />
                            ))}
                          </div>

                          <div className="history-poll-item__meta">
                            <span>Total votes: {poll.totalVotes || 0}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'transcript' && captionsEnabled && (
            <section className="history-detail__transcript-card" aria-label="Meeting spoken transcript">
              <div className="history-detail__transcript-header">
                <div className="history-detail__transcript-title-wrap">
                  <Captions size={18} aria-hidden="true" />
                  <h2 className="history-detail__transcript-title">Spoken Transcript</h2>
                  <span className="history-detail__transcript-count">
                    ({captions.length} {captions.length === 1 ? 'segment' : 'segments'})
                  </span>
                </div>

                <div className="history-detail__transcript-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={Download}
                    disabled={captions.length === 0}
                    onClick={handleDownloadCaptionsTxt}
                    aria-label="Download transcript as txt"
                  >
                    Download .txt
                  </Button>
                  {captions.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={Copy}
                      onClick={handleCopySpokenTranscript}
                      aria-label="Copy transcript to clipboard"
                    >
                      Copy transcript
                    </Button>
                  )}
                </div>
              </div>

              <div className="history-detail__saved-transcript-banner">
                <span className="history-detail__saved-transcript-pill">Saved Transcript</span>
                <p className="history-detail__saved-transcript-text">
                  Distinguished from live ephemeral captions: final transcribed segments preserved from admitted attendees during this meeting.
                </p>
              </div>

              <div className="history-detail__transcript-body">
                {captions.length === 0 ? (
                  <div className="history-detail__empty-transcript" role="status">
                    <p>No spoken transcript segments were recorded for this meeting.</p>
                  </div>
                ) : (
                  <div className="history-transcript__list" role="log">
                    {captions.map((cap, idx) => {
                      const offsetSeconds = Math.max(0, Math.floor((cap.offsetMs || 0) / 1000));
                      const mins = String(Math.floor(offsetSeconds / 60)).padStart(2, '0');
                      const secs = String(offsetSeconds % 60).padStart(2, '0');
                      const timeStr = `+${mins}:${secs}`;
                      return (
                        <div key={cap._id || idx} className="history-bubble-group history-bubble-group--first">
                          <div className="history-bubble-group__meta">
                            <span className="history-bubble-group__name">{cap.name || 'Speaker'}</span>
                            <span className="history-bubble-group__time">{timeStr}</span>
                          </div>
                          <div className="history-bubble history-bubble--transcript">
                            <p className="history-bubble__text">{cap.text}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
