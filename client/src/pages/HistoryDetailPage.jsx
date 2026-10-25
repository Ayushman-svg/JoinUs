import { ArrowLeft, Calendar, Clock, Copy, MessageSquare, ShieldAlert, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { getHistoryDetail, getMeetingMessages } from '../api/meetings.js';
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

  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isForbidden, setIsForbidden] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setIsForbidden(false);

    try {
      const [detailData, messagesData] = await Promise.all([
        getHistoryDetail(code),
        getMeetingMessages(code, 200),
      ]);
      setMeeting(detailData);
      setMessages(messagesData || []);
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
  }, [code]);

  const handleCopyTranscript = async () => {
    if (!messages.length) return;
    const lines = messages.map((m) => {
      const time = formatTime(m.createdAt);
      const isHost = m.from?.isHost;
      const baseName = m.from?.name || 'Guest';
      const name = isHost ? `${baseName} (Host)` : baseName;
      return `[${time}] ${name}: ${m.text}`;
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
    if (prev && prev.from?.id && m.from?.id && String(prev.from.id) === String(m.from.id)) {
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
                    const { message, isSelf, isFirstInGroup, time, senderName } = item;
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
                          }`}
                        >
                          <p className="history-bubble__text">{message.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
