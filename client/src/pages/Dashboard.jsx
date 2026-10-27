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
import { useFeature } from '../hooks/useFeature.js';
import useSlowRequest from '../hooks/useSlowRequest.js';
import ClassicDashboard from '../components/dashboard/ClassicDashboard.jsx';
import WorkplaceHome from '../components/dashboard/WorkplaceHome.jsx';
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
  const [instantPasscode, setInstantPasscode] = useState('');
  const [instantMuteOnEntry, setInstantMuteOnEntry] = useState(false);
  const [instantSubmitting, setInstantSubmitting] = useState(false);
  const [instantError, setInstantError] = useState('');

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');

  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleAt, setScheduleAt] = useState(() => toLocalInputValue(nextFullHour()));
  const [scheduleWaitingRoom, setScheduleWaitingRoom] = useState(true);
  const [schedulePasscode, setSchedulePasscode] = useState('');
  const [scheduleMuteOnEntry, setScheduleMuteOnEntry] = useState(false);
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
        passcode: instantPasscode.trim() || undefined,
        settings: instantMuteOnEntry ? { muteOnEntry: true } : undefined,
      });
      setActiveModal(null);
      setInstantTitle('');
      setInstantPasscode('');
      setInstantMuteOnEntry(false);
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
        passcode: schedulePasscode.trim() || undefined,
        settings: scheduleMuteOnEntry ? { muteOnEntry: true } : undefined,
      });
      setActiveModal(null);
      setScheduleTitle('');
      setSchedulePasscode('');
      setScheduleMuteOnEntry(false);
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

  const newHomeEnabled = useFeature('NEW_HOME');
  const schedulingEnabled = useFeature('SCHEDULING');
  const supportsScreenShare =
    typeof navigator !== 'undefined' && Boolean(navigator?.mediaDevices?.getDisplayMedia);

  // Filter meetings scheduled or active for today (future upcoming or currently live meetings only; past ended meetings belong in Recent/History)
  const todayMeetings = useMemo(() => {
    const now = new Date();
    return meetingsState.meetings
      .filter((m) => {
        // Ended, cancelled, or past meetings do NOT belong in Today's Schedule
        if (m.status === 'ended' || m.status === 'cancelled') return false;
        if (m.phase === 'past') return false;

        // Must have a scheduled date for today (or be currently live/ongoing today)
        const dateStr = m.scheduledAt || (m.phase === 'ongoing' ? m.startedAt : null);
        if (!dateStr) return false;

        const target = new Date(dateStr);
        const isToday =
          target.getFullYear() === now.getFullYear() &&
          target.getMonth() === now.getMonth() &&
          target.getDate() === now.getDate();

        return isToday && (m.phase === 'upcoming' || m.phase === 'ongoing');
      })
      .sort((a, b) => {
        const timeA = new Date(a.scheduledAt || a.startedAt || 0).getTime();
        const timeB = new Date(b.scheduledAt || b.startedAt || 0).getTime();
        return timeA - timeB;
      });
  }, [meetingsState.meetings]);

  async function handleStartShare() {
    try {
      const meeting = await createMeeting({
        title: `${user?.name || 'User'}'s Presentation`,
        waitingRoom: false,
      });
      navigate(`/m/${meeting.code}/call?startShare=true`);
    } catch (err) {
      toast({
        title: 'Could not start screen share meeting',
        description: err.message || 'Please try again',
        variant: 'danger',
      });
    }
  }

  const handleOpenSchedule = () => {
    if (schedulingEnabled) {
      navigate('/schedule');
      return;
    }
    setScheduleError('');
    setScheduleFieldErrors({});
    setActiveModal('schedule');
  };

  const nextMeeting = inProgress[0] || upcoming[0] || null;

  return (
    <>
      {newHomeEnabled ? (
        <WorkplaceHome
          timeString={timeString}
          dateString={dateString}
          onStartInstant={() => {
            setInstantError('');
            setActiveModal('instant');
          }}
          onOpenJoin={() => {
            setJoinError('');
            setActiveModal('join');
          }}
          onOpenSchedule={handleOpenSchedule}
          onStartShare={handleStartShare}

          supportsScreenShare={supportsScreenShare}
          todayMeetings={todayMeetings}
          inProgress={filteredInProgress}
          upcoming={filteredUpcoming}
          recent={filteredRecent}
          searchQuery={searchQuery}
          onClearSearch={() => setSearchQuery('')}
          navigate={navigate}
          user={user}
          getRecentBadgeKind={getRecentBadgeKind}
          meetingsStatus={meetingsState.status}
          meetingsError={meetingsState.error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isSlow={isSlow}
        />
      ) : (
        <ClassicDashboard
          user={user}
          stats={stats}
          inProgress={filteredInProgress}
          upcoming={filteredUpcoming}
          recent={filteredRecent}
          searchQuery={searchQuery}
          onClearSearch={() => setSearchQuery('')}
          onStartInstant={() => {
            setInstantError('');
            setActiveModal('instant');
          }}
          onOpenJoin={() => {
            setJoinError('');
            setActiveModal('join');
          }}
          onOpenSchedule={handleOpenSchedule}
          navigate={navigate}
          getRecentBadgeKind={getRecentBadgeKind}
          meetingsStatus={meetingsState.status}
          meetingsError={meetingsState.error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isSlow={isSlow}
        />
      )}

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
          <FormField
            id="instant-passcode"
            label="Passcode (optional)"
            type="password"
            maxLength={10}
            placeholder="4 to 10 characters"
            value={instantPasscode}
            onChange={(e) => setInstantPasscode(e.target.value)}
            disabled={instantSubmitting}
            helper="Require a 4–10 character passcode to join"
          />
          <Toggle
            id="instant-mute-on-entry"
            label="Mute on entry"
            helper="Automatically mute participants when they join"
            checked={instantMuteOnEntry}
            onChange={setInstantMuteOnEntry}
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
          <FormField
            id="schedule-passcode"
            label="Passcode (optional)"
            type="password"
            maxLength={10}
            placeholder="4 to 10 characters"
            value={schedulePasscode}
            onChange={(e) => setSchedulePasscode(e.target.value)}
            disabled={scheduleSubmitting}
            helper="Require a 4–10 character passcode to join"
          />
          <Toggle
            id="schedule-mute-on-entry"
            label="Mute on entry"
            helper="Automatically mute participants when they join"
            checked={scheduleMuteOnEntry}
            onChange={setScheduleMuteOnEntry}
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
    </>
  );
}
