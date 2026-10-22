import { Link2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getIceServers } from '../api/ice.js';
import { getMeeting } from '../api/meetings.js';
import CallControls from '../components/call/CallControls.jsx';
import CallProblem from '../components/call/CallProblem.jsx';
import CallStatusCard from '../components/call/CallStatusCard.jsx';
import ParticipantTile from '../components/call/ParticipantTile.jsx';
import CopyLinkButton from '../components/CopyLinkButton.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeetingMedia } from '../context/MeetingMediaContext.jsx';
import useCall from '../hooks/useCall.js';
import useSlowRequest from '../hooks/useSlowRequest.js';
import { DEFAULT_RTC_CONFIG } from '../webrtc/peer.js';

// Polite text for screen readers when someone joins or leaves
function useAnnouncement(peers) {
  const [text, setText] = useState('');
  const known = useRef(new Map());

  useEffect(() => {
    const current = new Map(peers.map((peer) => [peer.peerId, peer.user?.name ?? 'Someone']));
    const messages = [];
    current.forEach((name, id) => !known.current.has(id) && messages.push(`${name} joined`));
    known.current.forEach((name, id) => !current.has(id) && messages.push(`${name} left`));
    known.current = current;
    if (messages.length) setText(messages.join('. '));
  }, [peers]);

  return text;
}

export default function CallPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const media = useMeetingMedia();

  const [meeting, setMeeting] = useState(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [rtcConfig, setRtcConfig] = useState(null);

  // The title is only decoration here: if it cannot be loaded the code is shown instead
  useEffect(() => {
    const controller = new AbortController();
    getMeeting(code, { signal: controller.signal }).then(setMeeting, () => {});
    return () => controller.abort();
  }, [code]);

  // Fetch ICE / TURN configuration and check debug relay flag (?relay=1)
  useEffect(() => {
    const controller = new AbortController();
    const isForcedRelay = new URLSearchParams(window.location.search).get('relay') === '1';

    getIceServers({ signal: controller.signal })
      .then((data) => {
        setRtcConfig({
          iceServers: data?.iceServers?.length ? data.iceServers : DEFAULT_RTC_CONFIG.iceServers,
          ...(isForcedRelay ? { iceTransportPolicy: 'relay' } : {}),
        });
      })
      .catch(() => {
        setRtcConfig({
          ...DEFAULT_RTC_CONFIG,
          ...(isForcedRelay ? { iceTransportPolicy: 'relay' } : {}),
        });
      });

    return () => controller.abort();
  }, []);

  // Opening this page directly (without the join screen) starts the devices here
  const { status: mediaStatus, start: startMedia } = media;
  useEffect(() => {
    if (mediaStatus === 'idle') startMedia();
  }, [mediaStatus, startMedia]);

  const mediaSettled = mediaStatus === 'ready' || mediaStatus === 'error';
  const call = useCall({
    code,
    localStream: media.stream,
    localMedia: { audio: media.audioEnabled, video: media.videoEnabled },
    enabled: mediaSettled && rtcConfig !== null,
    rtcConfig: rtcConfig ?? DEFAULT_RTC_CONFIG,
  });
  const slow = useSlowRequest(call.status === 'connecting' || call.status === 'idle', 6000);
  const announcement = useAnnouncement(call.peers);

  function leave() {
    media.stop(); // releases the camera and microphone; leaving the page ends the call
    navigate('/');
  }

  function logInAgain() {
    logout();
    navigate('/login');
  }

  const isStatusScreen = ['waiting', 'denied', 'removed', 'ended'].includes(call.status);
  const problemCode =
    call.status === 'kicked'
      ? 'KICKED'
      : call.status === 'error'
      ? (call.error?.code ?? 'UNKNOWN')
      : null;
  const gettingReady = !mediaSettled && !isStatusScreen && !problemCode;
  const inCall = !gettingReady && !problemCode && !isStatusScreen;
  const people = call.status === 'active' ? call.peers.length + 1 : null;
  const localName = user.name;

  let notice = null;
  if (inCall) {
    if (call.status === 'reconnecting') {
      notice = (
        <Alert variant="warning">
          <span className="call__notice-line">
            <Spinner size="sm" /> Connection lost. Reconnecting…
          </span>
        </Alert>
      );
    } else if (call.status === 'active' && call.peers.length === 0) {
      notice = (
        <div className="call__waiting" role="status">
          <div>
            <p className="call__waiting-title">Waiting for others to join…</p>
            <p className="call__waiting-text">Share the invite link so people can join you.</p>
          </div>
          <CopyLinkButton code={code} label="Copy invite link" />
        </div>
      );
    } else if (call.status !== 'active') {
      notice = (
        <Alert variant="info">
          <span className="call__notice-line">
            <Spinner size="sm" />
            {call.status === 'joining' ? 'Joining the meeting…' : 'Connecting to the meeting…'}
            {slow && ' The server is waking up, which can take up to a minute.'}
          </span>
        </Alert>
      );
    }
  }

  return (
    <div className="call theme-meeting">
      <header className="call__bar">
        <div className="call__heading">
          <h1 className="call__title">{meeting?.title ?? 'Meeting'}</h1>
          <p className="call__code">{code}</p>
        </div>
        {people && (
          <p className="call__count">
            <Users size={16} aria-hidden="true" />
            {people} {people === 1 ? 'person' : 'people'}
          </p>
        )}
      </header>

      <main className="call__stage">
        {gettingReady && (
          <div className="call__center" role="status">
            <Spinner size="lg" />
            <p>Getting your camera ready…</p>
          </div>
        )}

        {isStatusScreen && (
          <div className="call__center">
            <CallStatusCard
              status={call.status}
              hostInRoom={call.hostInRoom}
              onRetry={call.retry}
              onLeave={leave}
            />
          </div>
        )}

        {problemCode && (
          <div className="call__center">
            <CallProblem code={problemCode} onRetry={call.retry} onLogin={logInAgain} />
          </div>
        )}

        {inCall && (
          <>
            <div className="call__notices">
              {notice}
              {media.error && (
                <Alert variant="warning" title="You joined without your camera and microphone">
                  {media.error.message}
                </Alert>
              )}
              {!media.error && media.videoError && <Alert variant="warning">{media.videoError.message}</Alert>}
              {!media.error && media.audioError && <Alert variant="warning">{media.audioError.message}</Alert>}
              {media.deviceLost && (
                <Alert variant="warning">
                  Your {media.deviceLost === 'video' ? 'camera' : 'microphone'} was disconnected.
                </Alert>
              )}
            </div>

            <div className="call__grid" data-count={Math.min(call.peers.length + 1, 2)}>
              <ParticipantTile
                local
                name={`${localName} (You)`}
                stream={media.stream}
                audioOn={media.audioEnabled}
                videoOn={media.videoEnabled}
              />
              {call.peers.map((peer) => (
                <ParticipantTile
                  key={peer.peerId}
                  name={peer.user?.name ?? 'Guest'}
                  stream={peer.stream}
                  audioOn={peer.audio}
                  videoOn={peer.video}
                  connectionState={peer.connectionState}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {inCall && <CallControls media={media} onLeave={() => setConfirmingLeave(true)} />}

      <Modal
        open={confirmingLeave}
        onClose={() => setConfirmingLeave(false)}
        size="sm"
        title="Leave meeting?"
        description="You can rejoin later with the same link."
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setConfirmingLeave(false)}>
              Stay
            </Button>
            <Button variant="danger" onClick={leave}>
              Leave
            </Button>
          </>
        }
      />

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
