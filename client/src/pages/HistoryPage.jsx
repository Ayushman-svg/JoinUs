import { Calendar, Clock, History, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { listHistory } from '../api/meetings.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Input from '../components/ui/Input.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { formatDateTime, formatDuration } from '../lib/datetime.js';

export default function HistoryPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchHistory = async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await listHistory();
      setMeetings(data || []);
      setStatus('ready');
    } catch (err) {
      setError(err?.message || 'Failed to load meeting history');
      setStatus('error');
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filteredMeetings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter(
      (m) =>
        m.title?.toLowerCase().includes(q) ||
        m.code?.toLowerCase().includes(q) ||
        m.host?.name?.toLowerCase().includes(q)
    );
  }, [meetings, searchQuery]);

  return (
    <div className="history-page">
      <header className="history-page__header">
        <div className="history-page__header-title">
          <h1 className="history-page__title">History</h1>
          <p className="history-page__subtitle">
            Past meetings and conversation transcripts
          </p>
        </div>

        <div className="history-page__search">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search past meetings…"
            leftIcon={Search}
            aria-label="Filter meetings by title"
            size="md"
          />
        </div>
      </header>

      <main className="history-page__content">
        {status === 'loading' && (
          <div className="history-list" aria-label="Loading past meetings">
            {[1, 2, 3].map((i) => (
              <div key={i} className="history-card history-card--skeleton">
                <div className="history-card__header">
                  <Skeleton width="45%" height="22px" />
                  <Skeleton width="80px" height="22px" />
                </div>
                <div className="history-card__meta">
                  <Skeleton width="140px" height="16px" />
                  <Skeleton width="80px" height="16px" />
                  <Skeleton width="100px" height="16px" />
                </div>
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <ErrorState
            title="Couldn't load history"
            description={error}
            onRetry={fetchHistory}
          />
        )}

        {status === 'ready' && meetings.length === 0 && (
          <EmptyState
            icon={History}
            title="No past meetings yet"
            description="Meetings you host or participate in will appear here once started."
            action={
              <Button variant="primary" onClick={() => navigate('/')}>
                Create meeting
              </Button>
            }
          />
        )}

        {status === 'ready' && meetings.length > 0 && filteredMeetings.length === 0 && (
          <div className="ui-state" role="status">
            <p className="ui-state__text">No meetings match "{searchQuery}"</p>
          </div>
        )}

        {status === 'ready' && filteredMeetings.length > 0 && (
          <div className="history-list" role="list" aria-label="Past meetings list">
            {filteredMeetings.map((meeting) => (
              <Link
                key={meeting.code}
                to={`/history/${encodeURIComponent(meeting.code)}`}
                className="history-card"
                role="listitem"
                aria-label={`View history for ${meeting.title || 'Meeting'}`}
              >
                <div className="history-card__header">
                  <h2 className="history-card__title">{meeting.title || 'Untitled Meeting'}</h2>
                  <div className="history-card__badges">
                    {meeting.isHost ? (
                      <Badge variant="primary">Hosted by you</Badge>
                    ) : (
                      <Badge variant="neutral">Host: {meeting.host?.name || 'Host'}</Badge>
                    )}
                    <StatusBadge kind={meeting.status} />
                  </div>
                </div>

                <div className="history-card__meta">
                  <span className="history-card__meta-item">
                    <Calendar size={15} aria-hidden="true" />
                    {meeting.startedAt ? formatDateTime(meeting.startedAt) : 'Not started'}
                  </span>
                  <span className="history-card__meta-item">
                    <Clock size={15} aria-hidden="true" />
                    {formatDuration(meeting.durationMs)}
                  </span>
                  <span className="history-card__meta-item">
                    <Users size={15} aria-hidden="true" />
                    {meeting.participantCount}{' '}
                    {meeting.participantCount === 1 ? 'participant' : 'participants'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
