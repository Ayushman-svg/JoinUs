import { Link2, MonitorUp, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getIceServers } from '../api/ice.js';
import { getMeeting } from '../api/meetings.js';
import CallControls from '../components/call/CallControls.jsx';
import CallProblem from '../components/call/CallProblem.jsx';
import CallStatusCard from '../components/call/CallStatusCard.jsx';
import ChatPanel from '../components/call/ChatPanel.jsx';
import ParticipantsPanel from '../components/call/ParticipantsPanel.jsx';
import ParticipantTile from '../components/call/ParticipantTile.jsx';
import VideoView from '../components/VideoView.jsx';
import CopyLinkButton from '../components/CopyLinkButton.jsx';
import Alert from '../components/ui/Alert.jsx';
import Avatar from '../components/ui/Avatar.jsx';
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
  const [activePanel, setActivePanel] = useState(null);
  const [peerToRemove, setPeerToRemove] = useState(null);
  const [toastGuest, setToastGuest] = useState(null);
  const toastedIds = useRef(new Set());
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
    currentUser: user,
  });
  const slow = useSlowRequest(call.status === 'connecting' || call.status === 'idle', 4000);
  const announcement = useAnnouncement(call.peers);

  const isHost = Boolean(
    call.isHost ||
      (meeting?.host?.id && user?.id ? String(meeting.host.id) === String(user.id) : false) ||
      (meeting?.host?.name && user?.name ? meeting.host.name === user.name : false)
  );

  useEffect(() => {
    if (!isHost || !call.waitingList?.length) return;
    const newest = call.waitingList[call.waitingList.length - 1];
    if (newest && !toastedIds.current.has(newest.peerId)) {
      toastedIds.current.add(newest.peerId);
      setToastGuest(newest);
      const timer = setTimeout(() => {
        setToastGuest((curr) => (curr?.peerId === newest.peerId ? null : curr));
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [isHost, call.waitingList]);

  useEffect(() => {
    if (toastGuest && !call.waitingList?.some((w) => w.peerId === toastGuest.peerId)) {
      setToastGuest(null);
    }
  }, [call.waitingList, toastGuest]);

  const { setChatOpen } = call;
  useEffect(() => {
    setChatOpen?.(activePanel === 'chat');
  }, [activePanel, setChatOpen]);

  const [screenToast, setScreenToast] = useState(null);
  const prevScreenShareRef = useRef(null);

  useEffect(() => {
    const prev = prevScreenShareRef.current;
    const curr = call.screenShare;
    prevScreenShareRef.current = curr;

    if (!prev && curr) {
      const name =
        curr.peerId === call.selfId
          ? 'You'
          : call.peers.find((p) => p.peerId === curr.peerId)?.user?.name ?? 'Someone';
      setScreenToast(`${name} started sharing`);
      const t = setTimeout(() => setScreenToast(null), 4000);
      return () => clearTimeout(t);
    } else if (prev && !curr) {
      const name =
        prev.peerId === call.selfId
          ? 'You'
          : call.peers.find((p) => p.peerId === prev.peerId)?.user?.name ?? 'Presenter';
      setScreenToast(`${name} stopped sharing`);
      const t = setTimeout(() => setScreenToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [call.screenShare, call.selfId, call.peers]);

  const isSelfSharing = Boolean(call.screenShare && call.selfId && call.screenShare.peerId === call.selfId);
  const isOtherSharing = Boolean(call.screenShare && (!call.selfId || call.screenShare.peerId !== call.selfId));
  const isPresenting = Boolean(call.screenShare);

  const presenterPeer = isOtherSharing
    ? call.peers.find((p) => p.peerId === call.screenShare.peerId)
    : null;
  const presenterName = isSelfSharing
    ? 'You'
    : presenterPeer?.user?.name ?? 'Someone';

  const handleStartScreenShare = async () => {
    try {
      await call.startScreenShare();
    } catch (err) {
      if (err?.code === 'SCREEN_SHARE_BUSY') {
        setScreenToast('Someone else is already sharing');
      } else {
        setScreenToast(err?.message || 'Could not start screen share');
      }
      setTimeout(() => setScreenToast(null), 4000);
    }
  };

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
            {slow && ' Waking up the server, this can take up to a minute on the free plan.'}
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
        {isOtherSharing && (
          <div className="call__presenting-banner" role="status">
            <MonitorUp size={14} aria-hidden="true" />
            <span>{presenterName} is presenting</span>
          </div>
        )}
        {people && (
          <p className="call__count">
            <Users size={16} aria-hidden="true" />
            {people} {people === 1 ? 'person' : 'people'}
          </p>
        )}
      </header>

      <div className="call__main-layout">
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
              {isSelfSharing && (
                <aside className="call__sharing-banner" role="status">
                  <MonitorUp size={16} aria-hidden="true" />
                  <span>You&apos;re sharing your screen</span>
                  <Button variant="danger" size="sm" onClick={call.stopScreenShare}>
                    Stop sharing
                  </Button>
                </aside>
              )}

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

              {isPresenting ? (
                <div className="call__stage-presentation">
                  <div className="call__presentation-main">
                    <VideoView
                      stream={call.screenStream}
                      muted={true}
                      className="presentation-video"
                    />
                  </div>
                  <div className="call__filmstrip">
                    <ParticipantTile
                      local
                      name={`${localName} (You)`}
                      stream={media.stream}
                      audioOn={media.audioEnabled}
                      videoOn={media.videoEnabled}
                      isSpeaking={call.activeSpeaker === 'local'}
                    />
                    {call.peers.map((peer) => (
                      <ParticipantTile
                        key={peer.peerId}
                        name={peer.user?.name ?? 'Guest'}
                        stream={peer.stream}
                        audioOn={peer.audio}
                        videoOn={peer.video}
                        connectionState={peer.connectionState}
                        isSpeaking={call.activeSpeaker === peer.peerId}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="call__grid" data-count={call.peers.length + 1}>
                  <ParticipantTile
                    local
                    name={`${localName} (You)`}
                    stream={media.stream}
                    audioOn={media.audioEnabled}
                    videoOn={media.videoEnabled}
                    isSpeaking={call.activeSpeaker === 'local'}
                  />
                  {call.peers.map((peer) => (
                    <ParticipantTile
                      key={peer.peerId}
                      name={peer.user?.name ?? 'Guest'}
                      stream={peer.stream}
                      audioOn={peer.audio}
                      videoOn={peer.video}
                      connectionState={peer.connectionState}
                      isSpeaking={call.activeSpeaker === peer.peerId}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        {inCall && (
          <div className={`call__panel-slot ${activePanel ? 'is-open' : ''}`}>
            {activePanel === 'participants' && (
              <ParticipantsPanel
                isOpen={activePanel === 'participants'}
                onClose={() => setActivePanel(null)}
                onSwitchToChat={() => setActivePanel('chat')}
                unreadCount={call.unreadCount}
                isHost={isHost}
                self={{
                  name: localName,
                  audioOn: media.audioEnabled,
                  videoOn: media.videoEnabled,
                }}
                peers={call.peers}
                waitingList={call.waitingList}
                screenSharer={call.screenShare}
                onStopHostScreenShare={call.stopHostScreenShare}
                onAdmit={(peerId) => call.admitPeer(peerId)}
                onDeny={(peerId) => call.denyPeer(peerId)}
                onAdmitAll={() => call.admitAllPeers()}
                onRemove={(peer) => setPeerToRemove(peer)}
              />
            )}
            {activePanel === 'chat' && (
              <ChatPanel
                isOpen={activePanel === 'chat'}
                onClose={() => setActivePanel(null)}
                onSwitchToParticipants={() => setActivePanel('participants')}
                participantCount={call.peers.length + 1}
                waitingCount={isHost ? call.waitingList.length : 0}
                messages={call.messages}
                currentUser={user}
                historyLoading={call.historyLoading}
                historyError={call.historyError}
                rateLimitHint={call.rateLimitHint}
                onSendMessage={call.sendMessage}
                onRetryMessage={call.retryMessage}
                onRetryLoadHistory={call.loadHistory}
              />
            )}
          </div>
        )}
      </div>

      {inCall && (
        <CallControls
          media={media}
          onLeave={() => setConfirmingLeave(true)}
          waitingCount={isHost ? call.waitingList.length : 0}
          participantCount={call.peers.length + 1}
          isPanelOpen={activePanel === 'participants'}
          isChatOpen={activePanel === 'chat'}
          unreadCount={call.unreadCount}
          isSharing={isSelfSharing}
          someoneElseSharing={isOtherSharing}
          onStartScreenShare={handleStartScreenShare}
          onStopScreenShare={call.stopScreenShare}
          onToggleParticipants={() =>
            setActivePanel((curr) => (curr === 'participants' ? null : 'participants'))
          }
          onToggleChat={() =>
            setActivePanel((curr) => (curr === 'chat' ? null : 'chat'))
          }
        />
      )}

      {inCall && isHost && toastGuest && (
        <aside className="call__waiting-toast" role="status" aria-live="polite">
          <Avatar name={toastGuest.user?.name ?? 'Guest'} size="sm" />
          <span className="call__waiting-toast-text">
            <strong>{toastGuest.user?.name ?? 'Guest'}</strong> is waiting
          </span>
          <div className="call__waiting-toast-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                call.admitPeer(toastGuest.peerId);
                setToastGuest(null);
              }}
            >
              Admit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                call.denyPeer(toastGuest.peerId);
                setToastGuest(null);
              }}
            >
              Deny
            </Button>
          </div>
        </aside>
      )}

      {/* Remove Confirm Modal */}
      <Modal
        open={Boolean(peerToRemove)}
        onClose={() => setPeerToRemove(null)}
        size="sm"
        title={`Remove ${peerToRemove?.user?.name ?? 'participant'}?`}
        description="They will be disconnected from the call and can ask to join again."
        footer={
          <>
            <Button
              variant="secondary"
              data-autofocus
              onClick={() => setPeerToRemove(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (peerToRemove) {
                  call.removePeer(peerToRemove.peerId);
                  setPeerToRemove(null);
                }
              }}
            >
              Remove
            </Button>
          </>
        }
      />

      {/* Leave Modal */}
      <Modal
        open={confirmingLeave}
        onClose={() => setConfirmingLeave(false)}
        size="sm"
        title="Leave meeting?"
        description={
          isHost
            ? undefined
            : 'You can rejoin later with the same link.'
        }
        footer={
          isHost ? (
            <div className="leave-modal__actions">
              <div className="leave-modal__option">
                <Button
                  variant="secondary"
                  className="leave-modal__btn"
                  onClick={() => {
                    setConfirmingLeave(false);
                    leave();
                  }}
                >
                  Leave meeting
                </Button>
                <span className="leave-modal__help">
                  Leave the meeting running for others to continue.
                </span>
              </div>
              <div className="leave-modal__option">
                <Button
                  variant="danger"
                  className="leave-modal__btn"
                  onClick={() => {
                    call.endMeeting();
                    setConfirmingLeave(false);
                  }}
                >
                  End meeting for all
                </Button>
                <span className="leave-modal__help">
                  Disconnect everyone and close the room.
                </span>
              </div>
              <Button
                variant="ghost"
                data-autofocus
                onClick={() => setConfirmingLeave(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="secondary"
                data-autofocus
                onClick={() => setConfirmingLeave(false)}
              >
                Stay
              </Button>
              <Button variant="danger" onClick={leave}>
                Leave
              </Button>
            </>
          )
        }
      />

      {screenToast && (
        <aside className="call__screen-toast" role="status" aria-live="polite">
          <MonitorUp size={16} aria-hidden="true" />
          <span>{screenToast}</span>
        </aside>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
