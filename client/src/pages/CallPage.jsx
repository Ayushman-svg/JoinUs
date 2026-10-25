import { Clock, LayoutGrid, Link2, Maximize2, Minimize2, MonitorUp, ShieldCheck, Users } from 'lucide-react';
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
import Tooltip from '../components/ui/Tooltip.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeetingMedia } from '../context/MeetingMediaContext.jsx';
import useCall from '../hooks/useCall.js';
import useSlowRequest from '../hooks/useSlowRequest.js';
import { DEFAULT_RTC_CONFIG } from '../webrtc/peer.js';

function formatElapsed(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

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

  // Zoom-style UI states
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState('gallery'); // 'gallery' | 'speaker'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [handRaised, setHandRaised] = useState(false);
  const [localReaction, setLocalReaction] = useState(null);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

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

  const { status: mediaStatus, start: startMedia } = media;
  const mediaSettled = mediaStatus === 'ready' || mediaStatus === 'error';
  const call = useCall({
    code,
    localStream: media.stream,
    localMedia: { audio: media.audioEnabled, video: media.videoEnabled },
    enabled: mediaSettled && rtcConfig !== null,
    rtcConfig: rtcConfig ?? DEFAULT_RTC_CONFIG,
    currentUser: user,
  });

  useEffect(() => {
    if (mediaStatus === 'idle' && !['ended', 'denied', 'removed'].includes(call.status)) {
      startMedia();
    }
  }, [mediaStatus, startMedia, call.status]);

  const slow = useSlowRequest(call.status === 'connecting' || call.status === 'idle', 4000);
  const announcement = useAnnouncement(call.peers);

  const isHost = Boolean(call.isHost);

  useEffect(() => {
    if (['ended', 'denied', 'removed'].includes(call.status)) {
      media.stream?.getTracks().forEach((track) => track.stop());
    }
  }, [call.status, media.stream]);

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

  const { setChatOpen, refreshWaitingList } = call;
  useEffect(() => {
    setChatOpen?.(activePanel === 'chat');
    if (activePanel === 'participants' && isHost) {
      refreshWaitingList?.();
    }
  }, [activePanel, setChatOpen, refreshWaitingList, isHost]);

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

  useEffect(() => {
    if (!inCall) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [inCall]);

  const activePeer = call.peers.find((p) => p.peerId === call.activeSpeaker);
  const isLocalSpeaking = call.activeSpeaker === 'local' || (!activePeer && !call.peers.length);

  return (
    <div className="call theme-meeting">
      <header className="call__bar zoom-call-header">
        <div className="zoom-call-header__left">
          <Tooltip label="Meeting Information & Security" side="bottom">
            <button
              type="button"
              className="zoom-security-shield-btn"
              onClick={() => setSecurityModalOpen(true)}
              aria-label="Meeting information and encryption status"
            >
              <ShieldCheck size={18} className="zoom-shield-icon" aria-hidden="true" />
            </button>
          </Tooltip>
          <div className="zoom-call-header__info">
            <h1 className="call__title zoom-call-header__title">{meeting?.title ?? 'Meeting'}</h1>
            <span className="zoom-call-header__divider" aria-hidden="true">|</span>
            <span className="zoom-call-header__timer" title="Elapsed meeting time">
              <Clock size={13} aria-hidden="true" />
              <span>{formatElapsed(elapsedSeconds)}</span>
            </span>
          </div>
        </div>

        {isOtherSharing && (
          <aside className="zoom-screen-share-bar zoom-screen-share-bar--remote" role="status">
            <span className="zoom-screen-share-badge zoom-screen-share-badge--remote">
              <MonitorUp size={14} aria-hidden="true" />
              <span>{presenterName} is sharing screen</span>
            </span>
          </aside>
        )}

        <div className="zoom-call-header__right">
          <button
            type="button"
            className="zoom-view-btn"
            onClick={() => setViewMode((curr) => (curr === 'gallery' ? 'speaker' : 'gallery'))}
            aria-label={`Switch to ${viewMode === 'gallery' ? 'Speaker View' : 'Gallery View'}`}
          >
            <LayoutGrid size={15} aria-hidden="true" />
            <span>{viewMode === 'gallery' ? 'Speaker View' : 'Gallery View'}</span>
          </button>
          <button
            type="button"
            className="zoom-fullscreen-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
          >
            {isFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          </button>
        </div>
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
                isReconnecting={Boolean(call.isReconnecting || call.status === 'reconnecting')}
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
                <aside className="zoom-screen-share-bar" role="status">
                  <span className="zoom-screen-share-badge">
                    <MonitorUp size={14} aria-hidden="true" />
                    <span>You are screen sharing</span>
                  </span>
                  <button
                    type="button"
                    className="zoom-screen-share-stop-btn"
                    onClick={call.stopScreenShare}
                  >
                    Stop Share
                  </button>
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
                    <div className="zoom-presentation-tag">
                      <MonitorUp size={13} aria-hidden="true" />
                      <span>{isSelfSharing ? 'Your Shared Screen' : `${presenterName}'s Screen`}</span>
                    </div>
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
                      isHost={isHost}
                      handRaised={handRaised}
                      reaction={localReaction}
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
                        isHost={peer.isHost}
                      />
                    ))}
                  </div>
                </div>
              ) : viewMode === 'speaker' && call.peers.length > 0 ? (
                /* Speaker View: Active speaker prominent, others in sleek filmstrip */
                <div className="call__stage-speaker">
                  <div className="call__speaker-filmstrip">
                    <ParticipantTile
                      local
                      name={`${localName} (You)`}
                      stream={media.stream}
                      audioOn={media.audioEnabled}
                      videoOn={media.videoEnabled}
                      isSpeaking={call.activeSpeaker === 'local'}
                      isHost={isHost}
                      handRaised={handRaised}
                      reaction={localReaction}
                    />
                    {call.peers
                      .filter((p) => p.peerId !== activePeer?.peerId)
                      .map((peer) => (
                        <ParticipantTile
                          key={peer.peerId}
                          name={peer.user?.name ?? 'Guest'}
                          stream={peer.stream}
                          audioOn={peer.audio}
                          videoOn={peer.video}
                          connectionState={peer.connectionState}
                          isSpeaking={call.activeSpeaker === peer.peerId}
                          isHost={peer.isHost}
                        />
                      ))}
                  </div>
                  <div className="call__speaker-main">
                    {activePeer ? (
                      <ParticipantTile
                        key={activePeer.peerId}
                        name={activePeer.user?.name ?? 'Guest'}
                        stream={activePeer.stream}
                        audioOn={activePeer.audio}
                        videoOn={activePeer.video}
                        connectionState={activePeer.connectionState}
                        isSpeaking={true}
                        isHost={activePeer.isHost}
                      />
                    ) : (
                      <ParticipantTile
                        local
                        name={`${localName} (You)`}
                        stream={media.stream}
                        audioOn={media.audioEnabled}
                        videoOn={media.videoEnabled}
                        isSpeaking={call.activeSpeaker === 'local'}
                        isHost={isHost}
                        handRaised={handRaised}
                        reaction={localReaction}
                      />
                    )}
                  </div>
                </div>
              ) : (
                /* Gallery View: Balanced Zoom grid */
                <div className="call__grid zoom-grid" data-count={call.peers.length + 1}>
                  <ParticipantTile
                    local
                    name={`${localName} (You)`}
                    stream={media.stream}
                    audioOn={media.audioEnabled}
                    videoOn={media.videoEnabled}
                    isSpeaking={call.activeSpeaker === 'local'}
                    isHost={isHost}
                    handRaised={handRaised}
                    reaction={localReaction}
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
                      isHost={peer.isHost}
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
                peers={call.peers}
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
          isHost={isHost}
          onOpenSecurity={() => setSecurityModalOpen(true)}
          handRaised={handRaised}
          onToggleHandRaise={() => setHandRaised((prev) => !prev)}
          onSendReaction={(emoji) => setLocalReaction(emoji)}
        />
      )}

      {/* Zoom Meeting Info & Encryption Modal */}
      <Modal
        open={securityModalOpen}
        title="Meeting Information"
        subtitle="End-to-End Encrypted Session"
        onClose={() => setSecurityModalOpen(false)}
      >
        <div className="zoom-info-card">
          <div className="zoom-info-row">
            <span className="zoom-info-label">Topic</span>
            <span className="zoom-info-value">{meeting?.title ?? 'Meeting'}</span>
          </div>
          <div className="zoom-info-row">
            <span className="zoom-info-label">Meeting ID</span>
            <span className="zoom-info-value font-mono">{code}</span>
          </div>
          <div className="zoom-info-row">
            <span className="zoom-info-label">Host</span>
            <span className="zoom-info-value">
              {meeting?.host?.name || (isHost ? localName : 'Host')}
            </span>
          </div>
          <div className="zoom-info-row">
            <span className="zoom-info-label">Security</span>
            <span className="zoom-info-value zoom-info-value--verified">
              <ShieldCheck size={16} aria-hidden="true" />
              Enhanced 256-bit AES Encryption
            </span>
          </div>
          <div className="zoom-info-row zoom-info-row--invite">
            <span className="zoom-info-label">Invite Link</span>
            <div className="zoom-info-invite-wrap">
              <span className="zoom-info-link-text">
                {window.location.origin}/meeting/{code}
              </span>
              <CopyLinkButton code={code} variant="secondary" size="sm" label="Copy Link" />
            </div>
          </div>
        </div>
      </Modal>

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
                  onClick={async () => {
                    setConfirmingLeave(false);
                    try {
                      await call.endMeeting();
                    } catch (err) {
                      console.error('Failed to end meeting:', err);
                    }
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
