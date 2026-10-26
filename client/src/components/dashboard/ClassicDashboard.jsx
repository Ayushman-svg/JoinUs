import {
  Calendar,
  CalendarClock,
  LogIn,
  Plus,
  Video,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import CopyLinkButton from '../CopyLinkButton.jsx';
import StatusBadge from '../StatusBadge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { formatDateTime, formatDuration } from '../../lib/datetime.js';

export default function ClassicDashboard({
  user,
  stats,
  inProgress = [],
  upcoming = [],
  recent = [],
  searchQuery = '',
  onClearSearch,
  onStartInstant,
  onOpenJoin,
  onOpenSchedule,
  navigate,
  getRecentBadgeKind,
  meetingsStatus,
  meetingsError,
  onRetry,
  isSlow = false,
}) {
  const query = searchQuery.trim().toLowerCase();

  return (
    <div className="dash" aria-label="Classic Dashboard">
      {/* Hero / Greeting */}
      <section className="dash-greeting">
        <h1 className="dash-greeting__title">Welcome, {user?.name}</h1>
        <p className="dash-greeting__subtitle">
          Start a call right away, or schedule one and share the link.
        </p>
      </section>

      {/* Quick Actions (3 Cards) */}
      <section className="dash-actions" aria-label="Quick actions">
        <button
          type="button"
          className="dash-action-card"
          onClick={onStartInstant}
        >
          <div className="dash-action-card__icon-box dash-action-card__icon-box--primary">
            <Video size={24} aria-hidden="true" />
          </div>
          <div className="dash-action-card__content">
            <h2 className="dash-action-card__title">Start instant meeting</h2>
            <p className="dash-action-card__description">
              Generate a room code and begin immediately
            </p>
          </div>
        </button>

        <button
          type="button"
          className="dash-action-card"
          onClick={onOpenJoin}
        >
          <div className="dash-action-card__icon-box dash-action-card__icon-box--accent">
            <LogIn size={24} aria-hidden="true" />
          </div>
          <div className="dash-action-card__content">
            <h2 className="dash-action-card__title">Join with code or link</h2>
            <p className="dash-action-card__description">
              Enter an existing meeting code to join
            </p>
          </div>
        </button>

        <button
          type="button"
          className="dash-action-card"
          onClick={onOpenSchedule}
        >
          <div className="dash-action-card__icon-box dash-action-card__icon-box--muted">
            <Plus size={24} aria-hidden="true" />
          </div>
          <div className="dash-action-card__content">
            <h2 className="dash-action-card__title">Schedule for later</h2>
            <p className="dash-action-card__description">
              Pick a date and time and invite guests
            </p>
          </div>
        </button>
      </section>

      {/* Stats Summary Bar */}
      <section className="dash-stats" aria-label="Meeting statistics">
        <div className="dash-stat-card">
          <div className="dash-stat-card__left">
            <span className="dash-stat-card__icon">
              <Video size={20} aria-hidden="true" />
            </span>
            <p className="dash-stat-card__label">Meetings hosted</p>
          </div>
          <span className="dash-stat-card__value">
            {meetingsStatus === 'loading' ? '-' : stats.hosted}
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
            {meetingsStatus === 'loading' ? '-' : stats.upcoming}
          </span>
        </div>
      </section>

      {/* Search notice if filter is applied */}
      {query && (
        <div className="dash-search-info" role="status">
          <span>
            Filtering by &ldquo;<strong>{searchQuery}</strong>&rdquo; (
            {inProgress.length + upcoming.length + recent.length} results)
          </span>
          <Button variant="ghost" size="sm" leftIcon={X} onClick={onClearSearch}>
            Clear filter
          </Button>
        </div>
      )}

      {/* Error State */}
      {meetingsStatus === 'error' && (
        <Card padding="lg">
          <ErrorState
            title="Could not load your meetings"
            description={meetingsError}
            onRetry={onRetry}
          />
        </Card>
      )}

      {/* In progress Section */}
      {meetingsStatus === 'ready' && inProgress.length > 0 && (
        <section className="dash-section" aria-labelledby="in-progress-title">
          <div className="dash-section__header">
            <h2 id="in-progress-title" className="dash-section__title">
              In progress
            </h2>
          </div>

          <div className="dash-grid">
            {inProgress.map((meeting) => (
              <div key={meeting.id || meeting._id} className="dash-card dash-card--live">
                <div className="dash-card__header">
                  <h3 className="dash-card__title">{meeting.title || 'Untitled Meeting'}</h3>
                  <StatusBadge kind="live" />
                </div>
                <p className="dash-card__meta">
                  Started {formatDateTime(meeting.startedAt || meeting.createdAt)}
                </p>
                <div className="dash-card__actions">
                  <Button
                    variant="primary"
                    leftIcon={Video}
                    onClick={() => navigate(`/m/${meeting.code}`)}
                  >
                    Join call
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

        {meetingsStatus === 'loading' && (
          <div className="dash-skeleton-grid">
            <div className="dash-skeleton-card">
              <Skeleton width="60%" height="1.5rem" />
              <Skeleton width="40%" height="1rem" />
              <Skeleton width="100%" height="2.5rem" />
            </div>
            <div className="dash-skeleton-card">
              <Skeleton width="55%" height="1.5rem" />
              <Skeleton width="35%" height="1rem" />
              <Skeleton width="100%" height="2.5rem" />
            </div>
          </div>
        )}

        {meetingsStatus === 'loading' && isSlow && (
          <p className="auth__hint" style={{ textAlign: 'center', marginTop: 'var(--space-4)' }} role="status">
            Waking up the server, this can take up to a minute on the free plan
          </p>
        )}

        {meetingsStatus === 'ready' && upcoming.length === 0 && (
          <Card padding="md">
            <EmptyState
              title={query ? 'No matching upcoming meetings' : 'No upcoming meetings'}
              description={
                query
                  ? `No upcoming meetings matched "${searchQuery}".`
                  : 'Meetings you schedule will appear here before they start.'
              }
              action={
                !query && (
                  <Button variant="secondary" onClick={onOpenSchedule} leftIcon={Calendar}>
                    Schedule a meeting
                  </Button>
                )
              }
            />
          </Card>
        )}

        {meetingsStatus === 'ready' && upcoming.length > 0 && (
          <div className="dash-grid">
            {upcoming.map((meeting) => {
              const diffMs = meeting.scheduledAt
                ? new Date(meeting.scheduledAt).getTime() - Date.now()
                : 0;
              const canJoinNow = diffMs <= 10 * 60 * 1000;

              return (
                <div key={meeting.id || meeting._id} className="dash-card">
                  <div className="dash-card__header">
                    <h3 className="dash-card__title">{meeting.title || 'Untitled Meeting'}</h3>
                    <StatusBadge kind="scheduled" />
                  </div>
                  <p className="dash-card__meta">
                    {meeting.scheduledAt
                      ? formatDateTime(meeting.scheduledAt)
                      : 'Scheduled'}
                  </p>
                  <div className="dash-card__actions">
                    {canJoinNow ? (
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

        {meetingsStatus === 'loading' && (
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

        {meetingsStatus === 'ready' && recent.length === 0 && (
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

        {meetingsStatus === 'ready' && recent.length > 0 && (
          <div className="dash-recent-list">
            {recent.map((meeting) => (
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
    </div>
  );
}
