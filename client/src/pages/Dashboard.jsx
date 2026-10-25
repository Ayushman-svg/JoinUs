import {
  Calendar,
  CalendarClock,
  ChevronDown,
  Clock,
  LogIn,
  MonitorUp,
  Plus,
  Search,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';

import { createMeeting, listMeetings } from '../api/meetings.js';
import CopyLinkButton from '../components/CopyLinkButton.jsx';
import FormField from '../components/FormField.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Alert from '../components/ui/Alert.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Modal from '../components/ui/Modal.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import Toggle from '../components/ui/Toggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import useSlowRequest from '../hooks/useSlowRequest.js';
import { formatDateTime, formatDuration, nextFullHour, toLocalInputValue } from '../lib/datetime.js';
import { extractMeetingCode } from '../lib/meetingLink.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const outlet = useOutletContext();
  const searchQuery = outlet?.searchQuery ?? '';
  const setSearchQuery = outlet?.setSearchQuery ?? (() => {});

  const [meetingsState, setMeetingsState] = useState({
    status: 'loading', // loading | ready | error
    meetings: [],
    error: '',
  });

  const isSlow = useSlowRequest(meetingsState.status === 'loading', 4000);

  const [activeModal, setActiveModal] = useState(null); // 'instant' | 'join' | 'schedule' | null
  const [reloadKey, setReloadKey] = useState(0);

  // Form states for modals
  const [instantTitle, setInstantTitle] = useState('');
  const [instantWaitingRoom, setInstantWaitingRoom] = useState(true);
  const [instantSubmitting, setInstantSubmitting] = useState(false);
  const [instantError, setInstantError] = useState('');

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');

  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleAt, setScheduleAt] = useState(() => toLocalInputValue(nextFullHour()));
  const [scheduleWaitingRoom, setScheduleWaitingRoom] = useState(true);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleFieldErrors, setScheduleFieldErrors] = useState({});

  // Live clock for Zoom Home widget
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = currentTime.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Load meetings
  useEffect(() => {
    const controller = new AbortController();
    setMeetingsState((prev) => ({
      ...prev,
      status: prev.meetings.length > 0 ? 'ready' : 'loading',
      error: '',
    }));

    listMeetings('all', { signal: controller.signal })
      .then((meetings) => {
        setMeetingsState({ status: 'ready', meetings, error: '' });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setMeetingsState((prev) => ({
          status: prev.meetings.length > 0 ? 'ready' : 'error',
          meetings: prev.meetings.length > 0 ? prev.meetings : [],
          error: prev.meetings.length > 0 ? '' : (err.message || 'Failed to load meetings'),
        }));
      });

    return () => controller.abort();
  }, [reloadKey]);

  // Re-fetch when page regains focus and every 30s while dashboard is open
  useEffect(() => {
    const onFocus = () => setReloadKey((k) => k + 1);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setReloadKey((k) => k + 1);
      }
    };

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setReloadKey((k) => k + 1);
      }
    }, 30000);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  function getRecentBadgeKind(meeting) {
    if (meeting.status === 'cancelled') return 'cancelled';
    if (meeting.status === 'ended') return 'ended';
    if (!meeting.startedAt) return 'not_started';
    return 'past';
  }

  // Compute inProgress, upcoming, recent, and stats
  const { inProgress, upcoming, recent, stats } = useMemo(() => {
    const all = meetingsState.meetings;
    const inProg = [];
    const up = [];
    const past = [];

    for (const m of all) {
      if (m.phase === 'ongoing') {
        inProg.push(m);
      } else if (m.phase === 'upcoming') {
        up.push(m);
      } else {
        past.push(m);
      }
    }

    return {
      inProgress: inProg,
      upcoming: up,
      recent: past,
      stats: {
        hosted: all.length,
        upcoming: up.length,
      },
    };
  }, [meetingsState.meetings]);

  // Client-side search filtering
  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (m) =>
    !query ||
    m.title?.toLowerCase().includes(query) ||
    m.code?.toLowerCase().includes(query);

  const filteredInProgress = useMemo(
    () => inProgress.filter(matchesQuery),
    [inProgress, query]
  );
  const filteredUpcoming = useMemo(
    () => upcoming.filter(matchesQuery),
    [upcoming, query]
  );
  const filteredRecent = useMemo(
    () => recent.filter(matchesQuery),
    [recent, query]
  );

  // Handlers for modals
  async function handleStartInstant(e) {
    e.preventDefault();
    setInstantError('');
    setInstantSubmitting(true);
    try {
      const meeting = await createMeeting({
        title: instantTitle.trim() || undefined,
        waitingRoom: instantWaitingRoom,
      });
      setActiveModal(null);
      setInstantTitle('');
      setInstantWaitingRoom(true);
      navigate(`/m/${meeting.code}`);
    } catch (err) {
      setInstantError(err.message || 'Failed to start instant meeting');
    } finally {
      setInstantSubmitting(false);
    }
  }

  function handleJoinSubmit(e) {
    e.preventDefault();
    setJoinError('');
    const code = extractMeetingCode(joinCodeInput);
    if (!code) {
      setJoinError('Enter a valid meeting code (e.g. abc-defg-hij) or invite link');
      return;
    }
    setActiveModal(null);
    setJoinCodeInput('');
    navigate(`/m/${code}`);
  }

  async function handleScheduleSubmit(e) {
    e.preventDefault();
    setScheduleError('');
    setScheduleFieldErrors({});

    const date = new Date(scheduleAt);
    if (!scheduleAt || Number.isNaN(date.getTime())) {
      setScheduleFieldErrors({ scheduledAt: 'Choose a date and time' });
      return;
    }
    if (date.getTime() <= Date.now()) {
      setScheduleFieldErrors({ scheduledAt: 'Choose a time in the future' });
      return;
    }

    setScheduleSubmitting(true);
    try {
      const meeting = await createMeeting({
        title: scheduleTitle.trim() || undefined,
        scheduledAt: date.toISOString(),
        waitingRoom: scheduleWaitingRoom,
      });
      setActiveModal(null);
      setScheduleTitle('');
      setScheduleAt(toLocalInputValue(nextFullHour()));
      setScheduleWaitingRoom(true);
      setReloadKey((k) => k + 1);
      toast({
        title: 'Meeting scheduled',
        description: `"${meeting.title}" is set for ${formatDateTime(meeting.scheduledAt)}.`,
        variant: 'success',
      });
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR' && err.details?.length > 0) {
        const map = {};
        for (const d of err.details) {
          if (d.field) map[d.field] = d.message;
        }
        setScheduleFieldErrors(map);
      } else {
        setScheduleError(err.message || 'Failed to schedule meeting');
      }
    } finally {
      setScheduleSubmitting(false);
    }
  }

  const nextMeeting = inProgress[0] || upcoming[0] || null;

  return (
    <div className="dash zoom-dash">
      {/* Zoom Home Hero: 4 Signature Quick Action Tiles + Zoom Live Clock Widget */}
      <section className="zoom-home-hero" aria-label="Zoom quick actions and schedule">
        <div className="zoom-actions-grid">
          {/* 1. New Meeting (Iconic Zoom Orange) */}
          <button
            type="button"
            className="zoom-action-tile zoom-action-tile--orange"
            onClick={() => {
              setInstantError('');
              setActiveModal('instant');
            }}
          >
            <div className="zoom-action-tile__icon-box">
              <Video size={36} aria-hidden="true" />
            </div>
            <span className="zoom-action-tile__label">New Meeting</span>
          </button>

          {/* 2. Join (Iconic Zoom Blue) */}
          <button
            type="button"
            className="zoom-action-tile zoom-action-tile--blue"
            onClick={() => {
              setJoinError('');
              setActiveModal('join');
            }}
          >
            <div className="zoom-action-tile__icon-box">
              <Plus size={36} aria-hidden="true" />
            </div>
            <span className="zoom-action-tile__label">Join</span>
          </button>

          {/* 3. Schedule (Iconic Zoom Calendar) */}
          <button
            type="button"
            className="zoom-action-tile zoom-action-tile--blue"
            onClick={() => {
              setScheduleError('');
              setScheduleFieldErrors({});
              setActiveModal('schedule');
            }}
          >
            <div className="zoom-action-tile__icon-box">
              <Calendar size={36} aria-hidden="true" />
            </div>
            <span className="zoom-action-tile__label">Schedule</span>
          </button>

          {/* 4. Share Screen (Iconic Zoom Screen Share) */}
          <button
            type="button"
            className="zoom-action-tile zoom-action-tile--teal"
            onClick={() => {
              setJoinError('');
              setActiveModal('join');
            }}
          >
            <div className="zoom-action-tile__icon-box">
              <MonitorUp size={36} aria-hidden="true" />
            </div>
            <span className="zoom-action-tile__label">Share Screen</span>
          </button>
        </div>

        {/* Zoom Clock & Next Meeting Widget */}
        <div className="zoom-widget-card">
          <div className="zoom-widget-clock">
            <span className="zoom-widget-time">{timeString}</span>
            <span className="zoom-widget-date">{dateString}</span>
          </div>

          <div className="zoom-widget-meeting">
            {nextMeeting ? (
              <div className="zoom-next-card">
                <div className="zoom-next-card__badge">
                  {nextMeeting.phase === 'ongoing' ? (
                    <span className="zoom-pulsing-badge">● IN PROGRESS</span>
                  ) : (
                    <span>UPCOMING</span>
                  )}
                </div>
                <h3 className="zoom-next-card__title">{nextMeeting.title || 'Meeting'}</h3>
                <p className="zoom-next-card__time">
                  {nextMeeting.scheduledAt
                    ? formatDateTime(nextMeeting.scheduledAt)
                    : 'Ready to continue'}
                </p>
                <div className="zoom-next-card__actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate(`/meeting/${nextMeeting.code}`)}
                  >
                    {nextMeeting.phase === 'ongoing' ? 'Join Now' : 'Start'}
                  </Button>
                  <CopyLinkButton code={nextMeeting.code} variant="secondary" size="sm" />
                </div>
              </div>
            ) : (
              <div className="zoom-widget-empty">
                <Clock size={22} className="zoom-widget-empty-icon" aria-hidden="true" />
                <p className="zoom-widget-empty-text">No more meetings scheduled today</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Stats Summary Bar */}
      <section className="dash-stats zoom-stats" aria-label="Meeting statistics">
        <div className="dash-stat-card">
          <div className="dash-stat-card__left">
            <span className="dash-stat-card__icon">
              <Video size={20} aria-hidden="true" />
            </span>
            <p className="dash-stat-card__label">Meetings hosted</p>
          </div>
          <span className="dash-stat-card__value">
            {meetingsState.status === 'loading' ? '-' : stats.hosted}
          </span>
        </div>

        <div className="dash-stat-card">
          <div className="dash-stat-card__left">
            <span className="dash-stat-card__icon">
              <CalendarClock size={20} aria-hidden="true" />
            </span>
            <p className="dash-stat-card__label">Upcoming meetings</p>
          </div>
          <span className="dash-stat-card__value">
            {meetingsState.status === 'loading' ? '-' : stats.upcoming}
          </span>
        </div>
      </section>

      {/* Search notice if filter is applied */}
      {query && (
        <div className="dash-search-info" role="status">
          <span>
            Filtering by &ldquo;<strong>{searchQuery}</strong>&rdquo; (
            {filteredUpcoming.length + filteredRecent.length} results)
          </span>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={X}
            onClick={() => setSearchQuery('')}
          >
            Clear filter
          </Button>
        </div>
      )}

      {/* Error State */}
      {meetingsState.status === 'error' && (
        <Card padding="lg">
          <ErrorState
            title="Could not load your meetings"
            description={meetingsState.error}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </Card>
      )}

      {/* In progress Section - shown only when it has items */}
      {meetingsState.status === 'ready' && filteredInProgress.length > 0 && (
        <section className="dash-section" aria-labelledby="in-progress-title">
          <div className="dash-section__header">
            <h2 id="in-progress-title" className="dash-section__title">
              In progress
            </h2>
          </div>

          <div className="dash-grid">
            {filteredInProgress.map((meeting) => (
              <div key={meeting.id || meeting._id} className="dash-meeting-card">
                <div className="dash-meeting-card__top">
                  <h3 className="dash-meeting-card__title">{meeting.title}</h3>
                  <Badge variant={meeting.isLive ? 'success' : 'neutral'}>
                    {meeting.isLive
                      ? `Live (${meeting.participantCount ?? 1})`
                      : 'Not ended'}
                  </Badge>
                </div>

                <div className="dash-meeting-card__meta">
                  <div className="dash-meeting-card__time">
                    <Clock size={16} aria-hidden="true" />
                    <span>
                      {meeting.scheduledAt
                        ? `Scheduled · ${formatDateTime(meeting.scheduledAt)}`
                        : `Instant · ${formatDateTime(meeting.startedAt || meeting.startsAt || meeting.createdAt)}`}
                    </span>
                  </div>
                  <span className="dash-meeting-card__code">{meeting.code}</span>
                </div>

                <div className="dash-meeting-card__actions">
                  <Button
                    variant="primary"
                    leftIcon={Video}
                    onClick={() => navigate(`/m/${meeting.code}`)}
                  >
                    {meeting.isLive ? 'Rejoin' : 'Continue'}
                  </Button>
                  <CopyLinkButton code={meeting.code} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Meetings Section */}
      <section className="dash-section" aria-labelledby="upcoming-meetings-title">
        <div className="dash-section__header">
          <h2 id="upcoming-meetings-title" className="dash-section__title">
            Upcoming meetings
          </h2>
        </div>

        {/* Loading Skeletons */}
        {meetingsState.status === 'loading' && (
          <div className="dash-skeleton-grid" aria-busy="true" aria-label="Loading upcoming meetings">
            <div className="dash-skeleton-card">
              <Skeleton width="60%" height="1.5rem" />
              <Skeleton width="40%" height="1rem" />
              <Skeleton width="30%" height="1rem" />
              <Skeleton height="2.5rem" />
            </div>
            <div className="dash-skeleton-card">
              <Skeleton width="70%" height="1.5rem" />
              <Skeleton width="50%" height="1rem" />
              <Skeleton width="30%" height="1rem" />
              <Skeleton height="2.5rem" />
            </div>
            <div className="dash-skeleton-card">
              <Skeleton width="55%" height="1.5rem" />
              <Skeleton width="45%" height="1rem" />
              <Skeleton width="30%" height="1rem" />
              <Skeleton height="2.5rem" />
            </div>
          </div>
        )}
        {meetingsState.status === 'loading' && isSlow && (
          <p className="auth__hint" style={{ textAlign: 'center', marginTop: 'var(--space-4)' }} role="status">
            Waking up the server, this can take up to a minute on the free plan
          </p>
        )}

        {/* Ready: List or Empty State */}
        {meetingsState.status === 'ready' && filteredUpcoming.length === 0 && (
          <Card padding="lg">
            <EmptyState
              icon={query ? Search : Calendar}
              title={query ? 'No matching upcoming meetings' : 'No upcoming meetings'}
              description={
                query
                  ? `No upcoming meetings matched "${searchQuery}". Try a different search term or clear the filter.`
                  : 'Schedule a meeting for a future date.'
              }
              action={
                query ? (
                  <Button variant="secondary" onClick={() => setSearchQuery('')}>
                    Clear search
                  </Button>
                ) : (
                  <Button
                    leftIcon={CalendarClock}
                    onClick={() => {
                      setScheduleError('');
                      setActiveModal('schedule');
                    }}
                  >
                    Schedule a meeting
                  </Button>
                )
              }
            />
          </Card>
        )}

        {meetingsState.status === 'ready' && filteredUpcoming.length > 0 && (
          <div className="dash-grid">
            {filteredUpcoming.map((meeting) => {
              const diffMs = new Date(meeting.scheduledAt).getTime() - Date.now();
              const canJoin = diffMs <= 15 * 60 * 1000;

              return (
                <div key={meeting.id || meeting._id} className="dash-meeting-card">
                  <div className="dash-meeting-card__top">
                    <h3 className="dash-meeting-card__title">{meeting.title}</h3>
                    <StatusBadge kind="scheduled" />
                  </div>

                  <div className="dash-meeting-card__meta">
                    <div className="dash-meeting-card__time">
                      <Clock size={16} aria-hidden="true" />
                      <span>{formatDateTime(meeting.scheduledAt)}</span>
                    </div>
                    <span className="dash-meeting-card__code">{meeting.code}</span>
                  </div>

                  <div className="dash-meeting-card__actions">
                    {canJoin ? (
                      <Button
                        variant="primary"
                        leftIcon={Video}
                        onClick={() => navigate(`/m/${meeting.code}`)}
                      >
                        Join
                      </Button>
                    ) : (
                      <Button variant="secondary" disabled>
                        Starts in {formatDuration(diffMs)}
                      </Button>
                    )}
                    <CopyLinkButton code={meeting.code} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Meetings Section */}
      <section className="dash-section" aria-labelledby="recent-meetings-title">
        <div className="dash-section__header">
          <h2 id="recent-meetings-title" className="dash-section__title">
            Recent meetings
          </h2>
        </div>

        {meetingsState.status === 'loading' && (
          <div className="dash-skeleton-grid">
            <div className="dash-skeleton-card">
              <Skeleton width="50%" height="1.25rem" />
              <Skeleton width="40%" height="1rem" />
            </div>
            <div className="dash-skeleton-card">
              <Skeleton width="60%" height="1.25rem" />
              <Skeleton width="40%" height="1rem" />
            </div>
          </div>
        )}

        {meetingsState.status === 'ready' && filteredRecent.length === 0 && (
          <Card padding="md">
            <EmptyState
              title={query ? 'No matching recent meetings' : 'No past meetings yet'}
              description={
                query
                  ? `No past meetings matched "${searchQuery}".`
                  : 'Completed or past meetings will appear here.'
              }
            />
          </Card>
        )}

        {meetingsState.status === 'ready' && filteredRecent.length > 0 && (
          <div className="dash-recent-list">
            {filteredRecent.map((meeting) => (
              <div key={meeting.id || meeting._id} className="dash-recent-item">
                <div className="dash-recent-item__main">
                  {meeting.status === 'ended' || meeting.status === 'cancelled' ? (
                    <span className="dash-recent-item__title">{meeting.title}</span>
                  ) : (
                    <Link
                      to={`/m/${meeting.code}`}
                      className="dash-recent-item__title"
                    >
                      {meeting.title}
                    </Link>
                  )}
                  <p className="dash-recent-item__time">
                    {meeting.scheduledAt
                      ? formatDateTime(meeting.scheduledAt)
                      : formatDateTime(meeting.startedAt || meeting.startsAt || meeting.createdAt)}
                    {' · '}
                    <code>{meeting.code}</code>
                  </p>
                </div>
                <div className="dash-recent-item__actions">
                  <StatusBadge kind={getRecentBadgeKind(meeting)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal: New Instant Meeting */}
      <Modal
        open={activeModal === 'instant'}
        onClose={() => setActiveModal(null)}
        title="Start an instant meeting"
        description="Your camera and microphone can be configured on the preview screen before anyone sees you."
      >
        <form onSubmit={handleStartInstant} noValidate>
          {instantError && (
            <Alert variant="danger" className="mb-4">
              {instantError}
            </Alert>
          )}
          <FormField
            id="instant-title"
            label="Meeting title (optional)"
            placeholder={`${user?.name}'s meeting`}
            value={instantTitle}
            onChange={(e) => setInstantTitle(e.target.value)}
            disabled={instantSubmitting}
            autoFocus
          />
          <Toggle
            id="instant-waiting-room"
            label="Waiting room"
            helper="Guests wait until you let them in"
            checked={instantWaitingRoom}
            onChange={setInstantWaitingRoom}
            disabled={instantSubmitting}
          />
          <div className="ui-modal__footer" style={{ padding: 0, marginTop: 'var(--space-6)' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setActiveModal(null)}
              disabled={instantSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              leftIcon={Video}
              loading={instantSubmitting}
            >
              Start meeting
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Join Meeting */}
      <Modal
        open={activeModal === 'join'}
        onClose={() => setActiveModal(null)}
        title="Join a meeting"
        description="Enter the meeting code or paste the full invite link you received."
      >
        <form onSubmit={handleJoinSubmit} noValidate>
          <FormField
            id="join-code-input"
            label="Meeting code or link"
            placeholder="e.g. abc-defg-hij"
            value={joinCodeInput}
            onChange={(e) => {
              setJoinCodeInput(e.target.value);
              setJoinError('');
            }}
            error={joinError}
            autoFocus
          />
          <div className="ui-modal__footer" style={{ padding: 0, marginTop: 'var(--space-6)' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setActiveModal(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" leftIcon={LogIn}>
              Join meeting
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Schedule Meeting */}
      <Modal
        open={activeModal === 'schedule'}
        onClose={() => setActiveModal(null)}
        title="Schedule a meeting"
        description="Choose a title and a future date and time for your meeting."
      >
        <form onSubmit={handleScheduleSubmit} noValidate>
          {scheduleError && (
            <Alert variant="danger" className="mb-4">
              {scheduleError}
            </Alert>
          )}
          <FormField
            id="schedule-title"
            label="Meeting title (optional)"
            placeholder="Project Review"
            value={scheduleTitle}
            onChange={(e) => setScheduleTitle(e.target.value)}
            disabled={scheduleSubmitting}
            autoFocus
          />
          <FormField
            id="schedule-date"
            label="Date and time"
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => {
              setScheduleAt(e.target.value);
              setScheduleFieldErrors({});
            }}
            error={scheduleFieldErrors.scheduledAt}
            disabled={scheduleSubmitting}
          />
          <Toggle
            id="schedule-waiting-room"
            label="Waiting room"
            helper="Guests wait until you let them in"
            checked={scheduleWaitingRoom}
            onChange={setScheduleWaitingRoom}
            disabled={scheduleSubmitting}
          />
          <div className="ui-modal__footer" style={{ padding: 0, marginTop: 'var(--space-6)' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setActiveModal(null)}
              disabled={scheduleSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              leftIcon={CalendarClock}
              loading={scheduleSubmitting}
            >
              Schedule meeting
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
