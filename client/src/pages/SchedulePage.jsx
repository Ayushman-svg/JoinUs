import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Globe,
  Lock,
  MicOff,
  Users,
  Repeat,
  Copy,
  Check,
  CalendarPlus,
  ArrowLeft,
  Video,
  FileText,
  ExternalLink,
} from 'lucide-react';

import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Alert from '../components/ui/Alert.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFeature } from '../hooks/useFeature.js';
import { createMeeting, getCalendarIcsUrl } from '../api/meetings.js';
import { nextFullHour } from '../lib/datetime.js';
import { formatInvitationText, getGoogleCalendarUrl } from '../lib/invitation.js';

const DURATION_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
];

function getTimeZones() {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch {
    // fallback below
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Australia/Sydney',
  ];
}

const pad = (n) => String(n).padStart(2, '0');

function getInitialDateTime() {
  const next = nextFullHour();
  const dateStr = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  const timeStr = `${pad(next.getHours())}:${pad(next.getMinutes())}`;
  return { dateStr, timeStr };
}

export default function SchedulePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const hostSecurityEnabled = useFeature('HOST_SECURITY');
  const schedulingEnabled = useFeature('SCHEDULING');

  const { dateStr: initialDate, timeStr: initialTime } = getInitialDateTime();
  const defaultZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  })();

  const [title, setTitle] = useState(user?.name ? `${user.name}'s Meeting` : 'Team Meeting');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(30);
  const [timeZone, setTimeZone] = useState(defaultZone);
  const [waitingRoom, setWaitingRoom] = useState(true);

  // Prompt 5 fields (only shown if HOST_SECURITY is enabled)
  const [passcode, setPasscode] = useState('');
  const [muteOnEntry, setMuteOnEntry] = useState(false);

  // Recurrence
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState('weekly');
  const [recurrenceEndType, setRecurrenceEndType] = useState('count');
  const [recurrenceCount, setRecurrenceCount] = useState(5);
  const [recurrenceUntil, setRecurrenceUntil] = useState('');

  // Status & Success state
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState(null);
  const [copied, setCopied] = useState(false);

  const availableTimeZones = getTimeZones();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setFieldErrors({});

    const errors = {};
    if (!title.trim()) {
      errors.title = 'Title is required';
    }
    if (!date) {
      errors.date = 'Date is required';
    }
    if (!time) {
      errors.time = 'Start time is required';
    }

    // Combine date & time
    let scheduledDate = null;
    if (date && time) {
      scheduledDate = new Date(`${date}T${time}`);
      if (Number.isNaN(scheduledDate.getTime())) {
        errors.date = 'Invalid date or time';
      } else if (scheduledDate.getTime() <= Date.now() - 60000) {
        errors.date = 'Start time must be in the future';
      }
    }

    if (hostSecurityEnabled && passcode.trim()) {
      if (passcode.trim().length < 4 || passcode.trim().length > 10) {
        errors.passcode = 'Passcode must be between 4 and 10 characters';
      }
    }

    let recurrencePayload = null;
    if (isRecurring) {
      recurrencePayload = { frequency };
      if (recurrenceEndType === 'count') {
        const c = Number(recurrenceCount);
        if (!c || c < 1 || c > 20) {
          errors.recurrenceCount = 'Count must be between 1 and 20';
        } else {
          recurrencePayload.count = c;
        }
      } else if (recurrenceEndType === 'until') {
        if (!recurrenceUntil) {
          errors.recurrenceUntil = 'End date is required';
        } else {
          const uDate = new Date(recurrenceUntil);
          if (Number.isNaN(uDate.getTime()) || uDate.getTime() <= scheduledDate?.getTime()) {
            errors.recurrenceUntil = 'End date must be after start date';
          } else {
            recurrencePayload.until = uDate.toISOString();
          }
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        duration: Number(duration),
        timeZone,
        scheduledAt: scheduledDate.toISOString(),
        waitingRoom,
      };

      if (hostSecurityEnabled) {
        if (passcode.trim()) {
          payload.passcode = passcode.trim();
        }
        if (muteOnEntry) {
          payload.muteOnEntry = true;
          payload.settings = { muteOnEntry: true };
        }
      }

      if (recurrencePayload) {
        payload.recurrence = recurrencePayload;
      }

      const meeting = await createMeeting(payload);
      setCreatedMeeting(meeting);
    } catch (err) {
      setSubmitError(err.message || 'Failed to schedule meeting. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!createdMeeting) return;
    const text = formatInvitationText({
      title: createdMeeting.title,
      scheduledAt: createdMeeting.scheduledAt,
      timeZone: createdMeeting.timeZone,
      duration: createdMeeting.duration,
      code: createdMeeting.code,
      passcode: hostSecurityEnabled && passcode.trim() ? passcode.trim() : undefined,
    });

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (createdMeeting) {
    const formattedDate = createdMeeting.scheduledAt
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: createdMeeting.timeZone || undefined,
        }).format(new Date(createdMeeting.scheduledAt))
      : '';

    const gcalUrl = getGoogleCalendarUrl({
      title: createdMeeting.title,
      description: createdMeeting.description,
      scheduledAt: createdMeeting.scheduledAt,
      duration: createdMeeting.duration,
      code: createdMeeting.code,
    });

    const icsUrl = getCalendarIcsUrl(createdMeeting.code);

    return (
      <div className="schedule-page schedule-page--success">
        <div className="schedule-success-card">
          <div className="schedule-success-header">
            <div className="schedule-success-icon" aria-hidden="true">
              <CalendarPlus size={36} />
            </div>
            <h1 className="schedule-success-title">Meeting Scheduled!</h1>
            <p className="schedule-success-subtitle">
              Your meeting is confirmed and saved to your upcoming schedule.
            </p>
          </div>

          <div className="schedule-details-box">
            <div className="schedule-details-row">
              <span className="schedule-details-label">Topic</span>
              <strong className="schedule-details-value">{createdMeeting.title}</strong>
            </div>
            {createdMeeting.description && (
              <div className="schedule-details-row">
                <span className="schedule-details-label">Agenda</span>
                <span className="schedule-details-value">{createdMeeting.description}</span>
              </div>
            )}
            <div className="schedule-details-row">
              <span className="schedule-details-label">Time</span>
              <span className="schedule-details-value">
                {formattedDate} {createdMeeting.timeZone ? `(${createdMeeting.timeZone})` : ''}
              </span>
            </div>
            <div className="schedule-details-row">
              <span className="schedule-details-label">Duration</span>
              <span className="schedule-details-value">{createdMeeting.duration} minutes</span>
            </div>
            <div className="schedule-details-row">
              <span className="schedule-details-label">Meeting Code</span>
              <code className="schedule-details-code">{createdMeeting.code}</code>
            </div>
            {hostSecurityEnabled && passcode.trim() && (
              <div className="schedule-details-row">
                <span className="schedule-details-label">Passcode</span>
                <code className="schedule-details-code">{passcode.trim()}</code>
              </div>
            )}
            {createdMeeting.recurrence?.frequency && (
              <div className="schedule-details-row">
                <span className="schedule-details-label">Recurrence</span>
                <span className="schedule-details-value">
                  Repeats {createdMeeting.recurrence.frequency}
                  {createdMeeting.recurrence.count ? ` (${createdMeeting.recurrence.count} times)` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="schedule-success-actions">
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleCopyInvite}
              className="schedule-action-btn"
            >
              {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              {copied ? 'Invitation Copied!' : 'Copy Invitation'}
            </Button>

            <div className="schedule-calendar-group">
              <a
                href={icsUrl}
                download={`meeting-${createdMeeting.code}.ics`}
                className="btn btn--secondary btn--md schedule-calendar-btn"
              >
                <Calendar size={16} aria-hidden="true" />
                Download .ics
              </a>
              <a
                href={gcalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--secondary btn--md schedule-calendar-btn"
              >
                <ExternalLink size={16} aria-hidden="true" />
                Add to Google Calendar
              </a>
            </div>

            <div className="schedule-nav-group">
              <Link to={`/meetings/${createdMeeting.code}`} className="btn btn--ghost btn--sm">
                View Details
              </Link>
              <Link to={`/m/${createdMeeting.code}`} className="btn btn--ghost btn--sm">
                Join Meeting
              </Link>
              <button
                type="button"
                onClick={() => {
                  setCreatedMeeting(null);
                  setTitle(user?.name ? `${user.name}'s Meeting` : 'Team Meeting');
                  setDescription('');
                }}
                className="btn btn--ghost btn--sm"
              >
                Schedule Another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="schedule-page">
      <div className="schedule-form-wrapper">
        <header className="schedule-header">
          <Link to="/" className="schedule-back-link" aria-label="Back to dashboard">
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Dashboard</span>
          </Link>
          <h1 className="schedule-title">Schedule a Meeting</h1>
          <p className="schedule-subtitle">
            Plan a future meeting, invite colleagues, and customize access controls.
          </p>
        </header>

        {submitError && (
          <Alert variant="danger" className="schedule-alert" role="alert">
            {submitError}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="schedule-form" noValidate>
          {/* Title */}
          <div className="form-group">
            <label htmlFor="schedule-title" className="form-label">
              Meeting Title *
            </label>
            <input
              id="schedule-title"
              type="text"
              className={`input ${fieldErrors.title ? 'input--invalid' : ''}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Design Architecture Review"
              maxLength={100}
              required
            />
            {fieldErrors.title && <span className="form-error">{fieldErrors.title}</span>}
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="schedule-description" className="form-label">
              Description / Agenda
            </label>
            <textarea
              id="schedule-description"
              className="textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Topics to discuss or prep work (optional)"
              maxLength={2000}
            />
          </div>

          {/* Date & Start Time */}
          <div className="schedule-grid-2">
            <div className="form-group">
              <label htmlFor="schedule-date" className="form-label">
                Date *
              </label>
              <div className="input-with-icon">
                <Calendar size={16} className="input-icon" aria-hidden="true" />
                <input
                  id="schedule-date"
                  type="date"
                  className={`input ${fieldErrors.date ? 'input--invalid' : ''}`}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              {fieldErrors.date && <span className="form-error">{fieldErrors.date}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="schedule-time" className="form-label">
                Start Time *
              </label>
              <div className="input-with-icon">
                <Clock size={16} className="input-icon" aria-hidden="true" />
                <input
                  id="schedule-time"
                  type="time"
                  className={`input ${fieldErrors.time ? 'input--invalid' : ''}`}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </div>
              {fieldErrors.time && <span className="form-error">{fieldErrors.time}</span>}
            </div>
          </div>

          {/* Duration & Time Zone */}
          <div className="schedule-grid-2">
            <div className="form-group">
              <label htmlFor="schedule-duration" className="form-label">
                Duration
              </label>
              <select
                id="schedule-duration"
                className="select"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="schedule-timezone" className="form-label">
                Time Zone
              </label>
              <div className="input-with-icon">
                <Globe size={16} className="input-icon" aria-hidden="true" />
                <select
                  id="schedule-timezone"
                  className="select"
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                >
                  {availableTimeZones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Recurrence */}
          <div className="schedule-section">
            <label className="checkbox-label schedule-toggle-label">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              <span className="checkbox-custom" />
              <span className="schedule-toggle-text">
                <Repeat size={16} aria-hidden="true" />
                Repeat meeting (recurring series)
              </span>
            </label>

            {isRecurring && (
              <div className="schedule-recurring-box">
                <div className="form-group">
                  <label htmlFor="recurrence-frequency" className="form-label">
                    Repeats
                  </label>
                  <select
                    id="recurrence-frequency"
                    className="select"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div className="form-group">
                  <span className="form-label">Ends</span>
                  <div className="schedule-radio-group">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="recurrenceEnd"
                        value="count"
                        checked={recurrenceEndType === 'count'}
                        onChange={() => setRecurrenceEndType('count')}
                      />
                      <span>After</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        className="input schedule-inline-number"
                        value={recurrenceCount}
                        disabled={recurrenceEndType !== 'count'}
                        onChange={(e) => setRecurrenceCount(e.target.value)}
                      />
                      <span>occurrences (up to 20)</span>
                    </label>

                    <label className="radio-label">
                      <input
                        type="radio"
                        name="recurrenceEnd"
                        value="until"
                        checked={recurrenceEndType === 'until'}
                        onChange={() => setRecurrenceEndType('until')}
                      />
                      <span>On date</span>
                      <input
                        type="date"
                        className="input schedule-inline-date"
                        value={recurrenceUntil}
                        disabled={recurrenceEndType !== 'until'}
                        onChange={(e) => setRecurrenceUntil(e.target.value)}
                      />
                    </label>
                  </div>
                  {fieldErrors.recurrenceCount && (
                    <span className="form-error">{fieldErrors.recurrenceCount}</span>
                  )}
                  {fieldErrors.recurrenceUntil && (
                    <span className="form-error">{fieldErrors.recurrenceUntil}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Security & Access */}
          <div className="schedule-section">
            <h2 className="schedule-section-title">Meeting Security & Admission</h2>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={waitingRoom}
                onChange={(e) => setWaitingRoom(e.target.checked)}
              />
              <span className="checkbox-custom" />
              <span>Enable waiting room (guests must be admitted by the host)</span>
            </label>

            {/* Prompt 5 Gated Fields */}
            {hostSecurityEnabled && (
              <div className="schedule-host-security-fields">
                <div className="form-group">
                  <label htmlFor="schedule-passcode" className="form-label">
                    Meeting Passcode (Prompt 5 Security)
                  </label>
                  <div className="input-with-icon">
                    <Lock size={16} className="input-icon" aria-hidden="true" />
                    <input
                      id="schedule-passcode"
                      type="text"
                      className={`input ${fieldErrors.passcode ? 'input--invalid' : ''}`}
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Optional 4-10 characters"
                      maxLength={10}
                    />
                  </div>
                  {fieldErrors.passcode && (
                    <span className="form-error">{fieldErrors.passcode}</span>
                  )}
                  <span className="form-hint">Only participants with this passcode can join.</span>
                </div>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={muteOnEntry}
                    onChange={(e) => setMuteOnEntry(e.target.checked)}
                  />
                  <span className="checkbox-custom" />
                  <span>
                    <MicOff size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Mute participants upon entry
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="schedule-form-footer">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => navigate('/')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={submitting}
              disabled={submitting}
            >
              Schedule Meeting
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
