import {
  Calendar,
  CalendarClock,
  ChevronDown,
  Clock,
  LogIn,
  MonitorUp,
  Plus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import CopyLinkButton from '../CopyLinkButton.jsx';
import StatusBadge from '../StatusBadge.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { formatDateTime, formatDuration } from '../../lib/datetime.js';

export default function WorkplaceHome({
  timeString,
  dateString,
  onStartInstant,
  onOpenJoin,
  onOpenSchedule,
  onStartShare,
  supportsScreenShare,
  todayMeetings = [],
  inProgress = [],
  upcoming = [],
  recent = [],
  searchQuery = '',
  onClearSearch,
  navigate,
  user,
  getRecentBadgeKind,
  meetingsStatus,
  meetingsError,
  onRetry,
  isSlow = false,
}) {
  // Collapsible section states for In progress, Upcoming, and Recent
  const [collapsedSections, setCollapsedSections] = useState({
    inProgress: false,
    upcoming: false,
    recent: false,
  });

  function toggleSection(sectionKey) {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  }

  const query = searchQuery.trim().toLowerCase();

  return (
    <div className="workplace-home" aria-label="Workplace Home Dashboard">
      {/* 1. Hero: Left Column (Large Clock + 4 Action Tiles) & Right Column ('Today' Schedule Card) */}
      <section className="workplace-hero" aria-label="Quick actions and today's schedule">
        <div className="workplace-hero__left">
          {/* Large Clock with Date */}
          <div className="workplace-clock" aria-label="Current time and date">
            <time className="workplace-clock__time" dateTime={new Date().toISOString()}>
              {timeString}
            </time>
            <span className="workplace-clock__date">{dateString}</span>
          </div>

          {/* Four Square Action Tiles */}
          <div className="workplace-tiles-grid" role="group" aria-label="Meeting quick actions">
            {/* Tile 1: New Meeting (Orange) */}
            <button
              type="button"
              className="workplace-tile workplace-tile--orange"
              onClick={onStartInstant}
              aria-label="Start a new meeting"
            >
              <div className="workplace-tile__icon-box" aria-hidden="true">
                <Video size={28} />
              </div>
              <span className="workplace-tile__label">New meeting</span>
            </button>

            {/* Tile 2: Join (Blue) */}
            <button
              type="button"
              className="workplace-tile workplace-tile--blue"
              onClick={onOpenJoin}
              aria-label="Join a meeting by code or link"
            >
              <div className="workplace-tile__icon-box" aria-hidden="true">
                <Plus size={28} />
              </div>
              <span className="workplace-tile__label">Join</span>
            </button>

            {/* Tile 3: Schedule (Blue) */}
            <button
              type="button"
              className="workplace-tile workplace-tile--blue"
              onClick={onOpenSchedule}
              aria-label="Schedule a meeting for later"
            >
              <div className="workplace-tile__icon-box" aria-hidden="true">
                <Calendar size={28} />
              </div>
              <span className="workplace-tile__label">Schedule</span>
            </button>

            {/* Tile 4: Share Screen (Teal/Green) - Hidden if browser lacks getDisplayMedia */}
            {supportsScreenShare && (
              <button
                type="button"
                className="workplace-tile workplace-tile--teal"
                onClick={onStartShare}
                aria-label="Share screen and start meeting"
              >
                <div className="workplace-tile__icon-box" aria-hidden="true">
                  <MonitorUp size={28} />
                </div>
                <span className="workplace-tile__label">Share screen</span>
              </button>
            )}
          </div>
        </div>

        {/* 'Today' Schedule Card */}
        <div className="workplace-today-card" aria-labelledby="today-card-title">
          <div className="workplace-today-card__header">
            <h2 id="today-card-title" className="workplace-today-card__title">
              <CalendarClock size={20} aria-hidden="true" />
              <span>Today&apos;s Schedule</span>
            </h2>
            <span className="workplace-today-card__count">
              {todayMeetings.length} {todayMeetings.length === 1 ? 'meeting' : 'meetings'}
            </span>
          </div>

          {meetingsStatus === 'loading' && (
            <div className="workplace-today-skeletons" aria-busy="true">
              <div className="workplace-today-item">
                <div style={{ flex: 1 }}>
                  <Skeleton width="60%" height="1.25rem" />
                  <Skeleton width="40%" height="0.875rem" style={{ marginTop: '0.4rem' }} />
                </div>
                <Skeleton width="72px" height="32px" />
              </div>
              <div className="workplace-today-item" style={{ marginTop: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <Skeleton width="50%" height="1.25rem" />
                  <Skeleton width="35%" height="0.875rem" style={{ marginTop: '0.4rem' }} />
                </div>
                <Skeleton width="72px" height="32px" />
              </div>
              {isSlow && (
                <p className="auth__hint" style={{ textAlign: 'center', marginTop: 'var(--space-4)' }} role="status">
                  Waking up the server, this can take up to a minute on the free plan
                </p>
              )}
            </div>
          )}

          {meetingsStatus === 'error' && (
            <div className="workplace-today-empty" role="alert">
              <ErrorState
                title="Could not load today's schedule"
                description={meetingsError || 'Please try again in a moment.'}
                onRetry={onRetry}
              />
            </div>
          )}

          {meetingsStatus === 'ready' && todayMeetings.length === 0 && (
            <div className="workplace-today-empty">
              <Clock size={36} className="workplace-today-empty__icon" aria-hidden="true" />
              <h3 className="workplace-today-empty__title">No meetings scheduled for today</h3>
              <p className="workplace-today-empty__desc">
                Start an instant meeting or schedule a future discussion anytime.
              </p>
              <Button variant="secondary" size="sm" onClick={onOpenSchedule} leftIcon={Calendar}>
                Schedule a meeting
              </Button>
            </div>
          )}

          {meetingsStatus === 'ready' && todayMeetings.length > 0 && (
            <div className="workplace-today-list" role="list">
              {todayMeetings.map((m) => {
                const isHost = m.host?.id === user?.id || m.host?._id === user?.id;
                const isLive = m.phase === 'ongoing';
                return (
                  <div key={m.id || m._id} className="workplace-today-item" role="listitem">
                    <div className="workplace-today-item__meta">
                      <h3 className="workplace-today-item__title">{m.title || 'Untitled Meeting'}</h3>
                      <div className="workplace-today-item__details">
                        <span className="workplace-today-item__time">
                          {m.scheduledAt
                            ? formatDateTime(m.scheduledAt)
                            : formatDateTime(m.startedAt || m.createdAt)}
                        </span>
                        <span>&bull;</span>
                        <span className="workplace-today-item__host">
                          {isHost ? 'Hosted by you' : `Host: ${m.host?.name || 'Teammate'}`}
                        </span>
                        <span>&bull;</span>
                        <span className="workplace-today-item__capacity">
                          Up to 4 participants
                        </span>
                      </div>
                    </div>

                    <div className="workplace-today-item__actions">
                      {isLive ? (
                        <Badge variant="success">● In progress</Badge>
                      ) : m.phase === 'upcoming' ? (
                        <Badge variant="info">Upcoming</Badge>
                      ) : (
                        <Badge variant="neutral">Ended</Badge>
                      )}

                      {m.status !== 'ended' && m.status !== 'cancelled' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => navigate(`/m/${m.code}`)}
                        >
                          Join
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Search notice if filter is applied */}
      {query && (
        <div className="dash-search-info" role="status">
          <span>
            Filtering meetings by &ldquo;<strong>{searchQuery}</strong>&rdquo; (
            {inProgress.length + upcoming.length + recent.length} results)
          </span>
          <Button variant="ghost" size="sm" leftIcon={X} onClick={onClearSearch}>
            Clear filter
          </Button>
        </div>
      )}

      {/* Error State with Retry Button */}
      {meetingsStatus === 'error' && (
        <Card padding="lg">
          <ErrorState
            title="Could not load your meetings"
            description={meetingsError || 'Please check your connection and try again.'}
            onRetry={onRetry}
          />
        </Card>
      )}

      {/* 2. In progress Section (Collapsible) */}
      {meetingsStatus === 'ready' && inProgress.length > 0 && (
        <section className="workplace-collapsible-section" aria-labelledby="heading-inprogress">
          <button
            type="button"
            className="workplace-collapsible-header"
            onClick={() => toggleSection('inProgress')}
            aria-expanded={!collapsedSections.inProgress}
            aria-controls="section-inprogress"
          >
            <h2 id="heading-inprogress" className="workplace-collapsible-header__title">
              <span>In progress</span>
              <Badge variant="success">{inProgress.length}</Badge>
            </h2>
            <ChevronDown
              size={18}
              className={`workplace-collapsible-header__chevron ${
                !collapsedSections.inProgress ? 'is-open' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {!collapsedSections.inProgress && (
            <div id="section-inprogress" className="workplace-collapsible-body">
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
            </div>
          )}
        </section>
      )}

      {/* 3. Upcoming Section (Collapsible) */}
      <section className="workplace-collapsible-section" aria-labelledby="heading-upcoming">
        <button
          type="button"
          className="workplace-collapsible-header"
          onClick={() => toggleSection('upcoming')}
          aria-expanded={!collapsedSections.upcoming}
          aria-controls="section-upcoming"
        >
          <h2 id="heading-upcoming" className="workplace-collapsible-header__title">
            <span>Upcoming meetings</span>
            <Badge variant="info">{upcoming.length}</Badge>
          </h2>
          <ChevronDown
            size={18}
            className={`workplace-collapsible-header__chevron ${
              !collapsedSections.upcoming ? 'is-open' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {!collapsedSections.upcoming && (
          <div id="section-upcoming" className="workplace-collapsible-body">
            {meetingsStatus === 'loading' && (
              <div className="dash-skeleton-grid" aria-busy="true">
                <div className="dash-skeleton-card">
                  <Skeleton width="60%" height="1.5rem" />
                  <Skeleton width="40%" height="1rem" />
                  <Skeleton height="2.5rem" />
                </div>
                <div className="dash-skeleton-card">
                  <Skeleton width="70%" height="1.5rem" />
                  <Skeleton width="50%" height="1rem" />
                  <Skeleton height="2.5rem" />
                </div>
              </div>
            )}

            {meetingsStatus === 'ready' && upcoming.length === 0 && (
              <EmptyState
                title={query ? 'No matching upcoming meetings' : 'No upcoming meetings'}
                description={
                  query
                    ? `No upcoming meetings matched "${searchQuery}".`
                    : 'Schedule a session above and it will show up here.'
                }
                action={
                  !query && (
                    <Button variant="secondary" onClick={onOpenSchedule} leftIcon={Calendar}>
                      Schedule meeting
                    </Button>
                  )
                }
              />
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
          </div>
        )}
      </section>

      {/* 4. Recent Section (Collapsible) */}
      <section className="workplace-collapsible-section" aria-labelledby="heading-recent">
        <button
          type="button"
          className="workplace-collapsible-header"
          onClick={() => toggleSection('recent')}
          aria-expanded={!collapsedSections.recent}
          aria-controls="section-recent"
        >
          <h2 id="heading-recent" className="workplace-collapsible-header__title">
            <span>Recent meetings</span>
            <Badge variant="neutral">{recent.length}</Badge>
          </h2>
          <ChevronDown
            size={18}
            className={`workplace-collapsible-header__chevron ${
              !collapsedSections.recent ? 'is-open' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {!collapsedSections.recent && (
          <div id="section-recent" className="workplace-collapsible-body">
            {meetingsStatus === 'loading' && (
              <div className="dash-skeleton-grid" aria-busy="true">
                <div className="dash-skeleton-card">
                  <Skeleton width="50%" height="1.25rem" />
                  <Skeleton width="40%" height="1rem" />
                </div>
                <div className="dash-skeleton-card">
                  <Skeleton width="60%" height="1.25rem" />
                  <Skeleton width="30%" height="1rem" />
                </div>
              </div>
            )}

            {meetingsStatus === 'ready' && recent.length === 0 && (
              <EmptyState
                title={query ? 'No matching recent meetings' : 'No past meetings yet'}
                description={
                  query
                    ? `No past meetings matched "${searchQuery}".`
                    : 'Completed or past meetings will appear here.'
                }
              />
            )}

            {meetingsStatus === 'ready' && recent.length > 0 && (
              <div className="dash-recent-list">
                {recent.map((meeting) => (
                  <div key={meeting.id || meeting._id} className="dash-recent-item">
                    <div className="dash-recent-item__main">
                      {meeting.status === 'ended' || meeting.status === 'cancelled' ? (
                        <span className="dash-recent-item__title">{meeting.title || 'Untitled Meeting'}</span>
                      ) : (
                        <Link to={`/m/${meeting.code}`} className="dash-recent-item__title">
                          {meeting.title || 'Untitled Meeting'}
                        </Link>
                      )}
                      <p className="dash-recent-item__time">
                        {meeting.scheduledAt
                          ? formatDateTime(meeting.scheduledAt)
                          : formatDateTime(meeting.startedAt || meeting.createdAt)}
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
          </div>
        )}
      </section>
    </div>
  );
}
