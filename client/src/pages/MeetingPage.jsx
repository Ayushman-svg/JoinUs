import { ArrowLeft, CalendarClock, Loader, Lock, Search, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { getMeeting } from '../api/meetings.js';
import AppHeader from '../components/AppHeader.jsx';
import CopyLinkButton from '../components/CopyLinkButton.jsx';
import FormField from '../components/FormField.jsx';
import MediaProblem from '../components/MediaProblem.jsx';
import MediaToggleButton from '../components/MediaToggleButton.jsx';
import PreviewTile from '../components/PreviewTile.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Alert from '../components/ui/Alert.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeetingMedia } from '../context/MeetingMediaContext.jsx';
import useSlowRequest from '../hooks/useSlowRequest.js';
import { formatDateTime } from '../lib/datetime.js';
import { inviteLink } from '../lib/meetingLink.js';

function PrejoinSkeleton() {
  const isSlow = useSlowRequest(true, 4000);
  return (
    <Card className="prejoin__card" padding="none" aria-busy="true" aria-label="Loading meeting">
      <div className="prejoin__head">
        <Skeleton width="70%" height="2rem" />
        <Skeleton width="45%" height="1rem" />
        <Skeleton width="55%" height="1rem" />
      </div>
      <div className="prejoin__preview">
        <Skeleton height="100%" className="prejoin__skeleton-preview" />
      </div>
      <div className="prejoin__actions">
        <Skeleton height="3rem" />
        <Skeleton width="60%" height="1rem" />
        {isSlow && (
          <p className="auth__hint" style={{ marginTop: 'var(--space-2)', textAlign: 'center' }} role="status">
            Waking up the server, this can take up to a minute on the free plan
          </p>
        )}
      </div>
    </Card>
  );
}

function joinHint({ cancelled, ended, mediaStatus, audioEnabled, videoEnabled, hasAudio, hasVideo }) {
  if (cancelled) return "This meeting was cancelled, so it can't be joined.";
  if (ended) return "This meeting has ended, so it can't be joined.";
  if (mediaStatus === 'idle' || mediaStatus === 'requesting') {
    return 'Waiting for camera and microphone permission…';
  }
  if (mediaStatus === 'error') {
    return 'You can still join and see and hear everyone, without your camera or microphone.';
  }
  const mic = hasAudio ? (audioEnabled ? 'on' : 'off') : 'unavailable';
  const cam = hasVideo ? (videoEnabled ? 'on' : 'off') : 'unavailable';
  return `You will join with your microphone ${mic} and your camera ${cam}.`;
}

export default function MeetingPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const media = useMeetingMedia();

  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ status: 'loading', meeting: null });
  const [passcode, setPasscode] = useState(() => {
    try {
      return sessionStorage.getItem(`passcode_${code}`) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', meeting: null });

    getMeeting(code, { signal: controller.signal })
      .then((meeting) => setState({ status: 'ready', meeting }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: err.code === 'MEETING_NOT_FOUND' ? 'notfound' : 'error', meeting: null });
      });

    return () => controller.abort();
  }, [code, reloadKey]);

  const { meeting } = state;
  const cancelled = meeting?.status === 'cancelled';
  const ended = meeting?.status === 'ended';
  const notJoinable = cancelled || ended;
  const canJoin = state.status === 'ready' && !notJoinable;

  // The camera is only asked for once we know the meeting can be joined
  const { status: mediaStatus, start: startMedia } = media;
  useEffect(() => {
    if (canJoin && mediaStatus === 'idle') startMedia();
  }, [canJoin, mediaStatus, startMedia]);

  const mediaSettled = mediaStatus === 'ready' || mediaStatus === 'error';
  const hint = joinHint({ cancelled, ended, mediaStatus, ...media });

  let preview;
  if (mediaStatus === 'error') {
    preview = <MediaProblem error={media.error} onRetry={media.retry} />;
  } else if (mediaStatus === 'ready') {
    preview = (
      <PreviewTile
        stream={media.stream}
        name={user.name}
        hasVideo={media.hasVideo}
        videoEnabled={media.videoEnabled}
        audioEnabled={media.audioEnabled}
      >
        <MediaToggleButton
          kind="audio"
          enabled={media.audioEnabled}
          available={media.hasAudio}
          onToggle={media.toggleAudio}
        />
        <MediaToggleButton
          kind="video"
          enabled={media.videoEnabled}
          available={media.hasVideo}
          onToggle={media.toggleVideo}
        />
      </PreviewTile>
    );
  } else {
    preview = (
      <div className="preview preview--waiting theme-meeting" role="status">
        <Loader size={22} className="preview__spin" aria-hidden="true" />
        <p>Allow camera and microphone access when your browser asks.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <AppHeader />
      <main className="prejoin">
        <Button as={Link} to="/" variant="ghost" size="sm" leftIcon={ArrowLeft} className="prejoin__back">
          Back to dashboard
        </Button>

        {state.status === 'loading' && <PrejoinSkeleton />}

        {state.status === 'notfound' && (
          <Card padding="lg">
            <ErrorState
              title="We couldn't find that meeting"
              description={`There is no meeting with the code ${code}. Check the code, or ask the host for a new invite link.`}
              action={
                <Button as={Link} to="/" variant="secondary" leftIcon={Search}>
                  Go to dashboard
                </Button>
              }
            />
          </Card>
        )}

        {state.status === 'error' && (
          <Card padding="lg">
            <ErrorState
              title="We couldn't load this meeting"
              description="Check your connection and try again. If the server was asleep, this can take a moment."
              onRetry={() => setReloadKey((key) => key + 1)}
            />
          </Card>
        )}

        {state.status === 'ready' && (
          <Card
            className={`prejoin__card ${notJoinable ? 'prejoin__card--single' : ''}`.trim()}
            padding="none"
            elevated
          >
            <header className="prejoin__head">
              <div className="prejoin__title-row">
                <h1 className="prejoin__title">{meeting.title}</h1>
                <StatusBadge kind={cancelled ? 'cancelled' : ended ? 'ended' : meeting.scheduledAt ? 'scheduled' : 'instant'} />
              </div>
              <p className="prejoin__host">
                <Avatar name={meeting.host.name} size="sm" />
                Hosted by {meeting.host.name}
              </p>
              <p className="prejoin__when">
                <CalendarClock size={16} aria-hidden="true" />
                {meeting.scheduledAt ? `Scheduled for ${formatDateTime(meeting.scheduledAt)}` : 'Instant meeting'}
              </p>
            </header>

            {!notJoinable && (
              <section className="prejoin__preview" aria-label="Camera preview">
                {preview}
                {mediaStatus === 'ready' && media.videoError && (
                  <Alert variant="warning">{media.videoError.message}</Alert>
                )}
                {mediaStatus === 'ready' && media.audioError && (
                  <Alert variant="warning">{media.audioError.message}</Alert>
                )}
                {media.deviceLost && (
                  <Alert variant="warning">
                    Your {media.deviceLost === 'video' ? 'camera' : 'microphone'} was disconnected.
                  </Alert>
                )}
              </section>
            )}

            <section className="prejoin__actions">
              {cancelled && (
                <Alert variant="warning" title="This meeting was cancelled">
                  The host cancelled it, so it can&apos;t be joined.
                </Alert>
              )}
              {ended && (
                <Alert variant="warning" title="This meeting has ended">
                  The host has ended this meeting, so it can&apos;t be joined.
                </Alert>
              )}

              {notJoinable ? (
                <Button
                  as={Link}
                  to="/"
                  size="lg"
                  fullWidth
                  variant="primary"
                >
                  Back to dashboard
                </Button>
              ) : (
                <>
                  <div style={{ marginBottom: 'var(--space-4)', textAlign: 'left' }}>
                    <FormField
                      id="prejoin-passcode"
                      label={meeting?.hasPasscode ? 'Meeting Passcode (required)' : 'Meeting Passcode (optional)'}
                      type="password"
                      placeholder="Enter passcode"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      maxLength={10}
                      helper={meeting?.hasPasscode ? 'This meeting is protected by a passcode.' : undefined}
                    />
                  </div>
                  <Button
                    size="lg"
                    fullWidth
                    leftIcon={Video}
                    disabled={!canJoin || !mediaSettled}
                    aria-describedby="join-hint"
                    onClick={() => {
                      const trimmed = passcode.trim();
                      if (trimmed) {
                        try {
                          sessionStorage.setItem(`passcode_${code}`, trimmed);
                        } catch {}
                      }
                      navigate(`/m/${code}/call`, { state: { passcode: trimmed } });
                    }}
                  >
                    Join meeting
                  </Button>
                  <p id="join-hint" className="prejoin__hint" aria-live="polite">
                    {hint}
                  </p>
                </>
              )}

              {!notJoinable && (
                <div className="prejoin__share">
                  <h2 className="prejoin__share-title">Invite link</h2>
                  <div className="prejoin__share-row">
                    <code className="prejoin__link">{inviteLink(meeting.code)}</code>
                    <CopyLinkButton code={meeting.code} />
                  </div>
                </div>
              )}
            </section>
          </Card>
        )}
      </main>
    </div>
  );
}
