import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Globe,
  Lock,
  Copy,
  Check,
  ArrowLeft,
  Video,
  Edit2,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Users,
  Repeat,
  Shield,
} from 'lucide-react';

import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Alert from '../components/ui/Alert.jsx';
import Modal from '../components/ui/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFeature } from '../hooks/useFeature.js';
import {
  getMeeting,
  updateMeeting,
  cancelMeeting,
  getCalendarIcsUrl,
} from '../api/meetings.js';
import { formatInvitationText, getGoogleCalendarUrl } from '../lib/invitation.js';

const DURATION_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
];

export default function MeetingDetailsPage({
  initialLoading,
  initialMeeting = null,
  initialError = '',
} = {}) {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth() || {};
  const hostSecurityEnabled = useFeature('HOST_SECURITY');

  const [meeting, setMeeting] = useState(initialMeeting);
  const [loading, setLoading] = useState(
    initialLoading !== undefined ? initialLoading : (initialMeeting || initialError ? false : true)
  );
  const [error, setError] = useState(initialError);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDuration, setEditDuration] = useState(30);
  const [editTimeZone, setEditTimeZone] = useState('UTC');
  const [editWaitingRoom, setEditWaitingRoom] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState('');

  const loadDetails = () => {
    setLoading(true);
    setError('');
    getMeeting(code)
      .then((data) => {
        setMeeting(data);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load meeting details');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (initialMeeting || initialError) return;
    loadDetails();
  }, [code]);

  const isHost = Boolean(
    user && meeting?.host?.id && String(user.id) === String(meeting.host.id)
  );

  const handleOpenEdit = () => {
    if (!meeting) return;
    setEditTitle(meeting.title || '');
    setEditDescription(meeting.description || '');
    setEditDuration(meeting.duration || 30);
    setEditTimeZone(meeting.timeZone || 'UTC');
    setEditWaitingRoom(meeting.waitingRoom !== false);
    setEditError('');
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      setEditError('Title is required');
      return;
    }
    setUpdating(true);
    setEditError('');
    try {
      const updated = await updateMeeting(code, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        duration: Number(editDuration),
        timeZone: editTimeZone,
        waitingRoom: editWaitingRoom,
      });
      setMeeting((prev) => ({
        ...prev,
        ...updated,
      }));
      setShowEditModal(false);
    } catch (err) {
      setEditError(err.message || 'Failed to update meeting');
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    setCancelError('');
    try {
      const updated = await cancelMeeting(code);
      setMeeting((prev) => ({
        ...prev,
        status: updated.status || 'cancelled',
      }));
      setShowCancelModal(false);
    } catch (err) {
      setCancelError(err.message || 'Failed to cancel meeting');
    } finally {
      setCancelling(false);
    }
  };

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/m/${code}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      }
    } catch {
      // ignore
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyInvitation = async () => {
    if (!meeting) return;
    const text = formatInvitationText({
      title: meeting.title,
      scheduledAt: meeting.scheduledAt || meeting.startsAt,
      timeZone: meeting.timeZone,
      duration: meeting.duration,
      code: meeting.code,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // ignore
    }
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  if (loading) {
    return (
      <div className="meeting-details-page">
        <div className="meeting-details-card">
          <p className="meeting-details-loading">Loading meeting details…</p>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="meeting-details-page">
        <div className="meeting-details-card">
          <Alert variant="danger">{error || 'Meeting not found'}</Alert>
          <div className="meeting-details-footer-nav">
            <Link to="/" className="btn btn--secondary btn--md">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isCancelled = meeting.status === 'cancelled';
  const meetingDateObj = new Date(meeting.scheduledAt || meeting.startsAt || Date.now());
  const viewerTimeZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    } catch {
      return 'Local';
    }
  })();

  const formattedViewerTime = !Number.isNaN(meetingDateObj.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(meetingDateObj)
    : 'Not scheduled';

  const gcalUrl = getGoogleCalendarUrl({
    title: meeting.title,
    description: meeting.description,
    scheduledAt: meeting.scheduledAt || meeting.startsAt,
    duration: meeting.duration,
    code: meeting.code,
  });

  const icsUrl = getCalendarIcsUrl(meeting.code);
  const meetingUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/m/${meeting.code}`;

  return (
    <div className="meeting-details-page">
      <div className="meeting-details-card">
        {/* Header */}
        <header className="meeting-details-header">
          <Link to="/" className="schedule-back-link" aria-label="Back to dashboard">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Dashboard</span>
          </Link>

          <div className="meeting-details-title-row">
            <h1 className="meeting-details-title">{meeting.title}</h1>
            <StatusBadge kind={isCancelled ? 'cancelled' : meeting.scheduledAt ? 'scheduled' : 'active'} />
          </div>

          {isCancelled && (
            <Alert variant="warning" className="mt-2 mb-4">
              This meeting has been cancelled by the host. Participants can no longer join.
            </Alert>
          )}
        </header>

        {/* Info Grid */}
        <div className="meeting-details-grid">
          {/* Time & Time Zone */}
          <div className="meeting-details-item">
            <div className="meeting-details-item-icon" aria-hidden="true">
              <Calendar size={18} />
            </div>
            <div className="meeting-details-item-content">
              <span className="meeting-details-item-label">Date & Time (Your Local Time)</span>
              <strong className="meeting-details-item-value">{formattedViewerTime}</strong>
              <span className="meeting-details-item-sub">
                Time Zone: {viewerTimeZone}
                {meeting.timeZone && meeting.timeZone !== viewerTimeZone && (
                  <> (Scheduled in: {meeting.timeZone})</>
                )}
              </span>
            </div>
          </div>

          {/* Duration */}
          <div className="meeting-details-item">
            <div className="meeting-details-item-icon" aria-hidden="true">
              <Clock size={18} />
            </div>
            <div className="meeting-details-item-content">
              <span className="meeting-details-item-label">Duration</span>
              <strong className="meeting-details-item-value">{meeting.duration || 30} minutes</strong>
            </div>
          </div>

          {/* Meeting Link & Code */}
          <div className="meeting-details-item">
            <div className="meeting-details-item-icon" aria-hidden="true">
              <Video size={18} />
            </div>
            <div className="meeting-details-item-content">
              <span className="meeting-details-item-label">Meeting Link & Code</span>
              <div className="meeting-details-link-box">
                <span className="meeting-details-link-url">{meetingUrl}</span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="btn btn--ghost btn--sm meeting-details-copy-btn"
                  title="Copy link"
                  aria-label="Copy meeting link"
                >
                  {copiedLink ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <span className="meeting-details-item-sub">Code: <code>{meeting.code}</code></span>
            </div>
          </div>

          {/* Host */}
          <div className="meeting-details-item">
            <div className="meeting-details-item-icon" aria-hidden="true">
              <Users size={18} />
            </div>
            <div className="meeting-details-item-content">
              <span className="meeting-details-item-label">Host</span>
              <strong className="meeting-details-item-value">
                {meeting.host?.name || 'Unknown'}
                {isHost && <span className="meeting-details-host-badge"> (You)</span>}
              </strong>
            </div>
          </div>

          {/* Security & Access */}
          <div className="meeting-details-item">
            <div className="meeting-details-item-icon" aria-hidden="true">
              <Shield size={18} />
            </div>
            <div className="meeting-details-item-content">
              <span className="meeting-details-item-label">Security & Admission</span>
              <span className="meeting-details-item-value">
                Waiting Room: {meeting.waitingRoom !== false ? 'Enabled' : 'Disabled'}
                {meeting.hasPasscode && ' • Passcode Protected'}
              </span>
            </div>
          </div>

          {/* Recurrence if configured */}
          {meeting.recurrence?.frequency && (
            <div className="meeting-details-item">
              <div className="meeting-details-item-icon" aria-hidden="true">
                <Repeat size={18} />
              </div>
              <div className="meeting-details-item-content">
                <span className="meeting-details-item-label">Recurrence</span>
                <span className="meeting-details-item-value">
                  Repeats {meeting.recurrence.frequency}
                  {meeting.recurrence.count ? ` (${meeting.recurrence.count} occurrences)` : ''}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Description / Agenda */}
        {meeting.description && (
          <div className="meeting-details-agenda">
            <h2 className="meeting-details-agenda-title">Agenda / Description</h2>
            <p className="meeting-details-agenda-text">{meeting.description}</p>
          </div>
        )}

        {/* Main Action Bar */}
        <div className="meeting-details-actions">
          {!isCancelled && (
            <Button
              type="button"
              variant="primary"
              size="lg"
              leftIcon={Video}
              onClick={() => navigate(`/m/${meeting.code}`)}
              className="meeting-details-join-btn"
            >
              Join Meeting
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            size="md"
            leftIcon={copiedInvite ? Check : Copy}
            onClick={handleCopyInvitation}
          >
            {copiedInvite ? 'Invitation Copied!' : 'Copy Invitation'}
          </Button>

          <div className="schedule-calendar-group">
            <a
              href={icsUrl}
              download={`meeting-${meeting.code}.ics`}
              className="btn btn--secondary btn--md"
            >
              <Calendar size={16} aria-hidden="true" />
              Download .ics
            </a>
            <a
              href={gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--secondary btn--md"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Google Calendar
            </a>
          </div>

          {/* Host Controls: Edit & Cancel */}
          {isHost && !isCancelled && (
            <div className="meeting-details-host-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={Edit2}
                onClick={handleOpenEdit}
              >
                Edit Meeting
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                leftIcon={Trash2}
                onClick={() => {
                  setCancelError('');
                  setShowCancelModal(true);
                }}
              >
                Cancel Meeting
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Meeting"
        description="Updates apply to the meeting and recurring series."
      >
        <form onSubmit={handleSaveEdit} className="schedule-form" noValidate>
          {editError && (
            <Alert variant="danger" className="mb-4">
              {editError}
            </Alert>
          )}

          <div className="form-group">
            <label htmlFor="edit-title" className="form-label">
              Meeting Title *
            </label>
            <input
              id="edit-title"
              type="text"
              className="input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-description" className="form-label">
              Description / Agenda
            </label>
            <textarea
              id="edit-description"
              className="textarea"
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="schedule-grid-2">
            <div className="form-group">
              <label htmlFor="edit-duration" className="form-label">
                Duration
              </label>
              <select
                id="edit-duration"
                className="select"
                value={editDuration}
                onChange={(e) => setEditDuration(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="edit-timezone" className="form-label">
                Time Zone
              </label>
              <input
                id="edit-timezone"
                type="text"
                className="input"
                value={editTimeZone}
                onChange={(e) => setEditTimeZone(e.target.value)}
              />
            </div>
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={editWaitingRoom}
              onChange={(e) => setEditWaitingRoom(e.target.checked)}
            />
            <span className="checkbox-custom" />
            <span>Enable waiting room</span>
          </label>

          <div className="schedule-form-footer">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowEditModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={updating}
              disabled={updating}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Meeting?"
        description="Are you sure you want to cancel this meeting? Participants will no longer be able to join."
      >
        {cancelError && (
          <Alert variant="danger" className="mb-4">
            {cancelError}
          </Alert>
        )}
        <p style={{ margin: '0 0 var(--space-4) 0', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          This will mark the meeting as cancelled. The history record will remain available for reference.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowCancelModal(false)}
            disabled={cancelling}
          >
            Keep Meeting
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirmCancel}
            loading={cancelling}
            disabled={cancelling}
          >
            Yes, Cancel Meeting
          </Button>
        </div>
      </Modal>
    </div>
  );
}
