import { Clock, Hand, LayoutGrid, Link2, Lock, Maximize2, Minimize2, MonitorUp, Shield, ShieldAlert, ShieldCheck, User, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { getIceServers } from '../api/ice.js';
import { getMeeting } from '../api/meetings.js';
import CallControls from '../components/call/CallControls.jsx';
import CallProblem from '../components/call/CallProblem.jsx';
import CallStatusCard from '../components/call/CallStatusCard.jsx';
import CaptionBar from '../components/call/CaptionBar.jsx';
import CaptionsOptInModal from '../components/call/CaptionsOptInModal.jsx';
import ChatPanel from '../components/call/ChatPanel.jsx';
import FloatingReactions from '../components/call/FloatingReactions.jsx';
import MeetingHeader from '../components/call/MeetingHeader.jsx';
import ParticipantPollCard from '../components/call/ParticipantPollCard.jsx';
import ParticipantsPanel from '../components/call/ParticipantsPanel.jsx';
import ParticipantTile from '../components/call/ParticipantTile.jsx';
import PollsPanel from '../components/call/PollsPanel.jsx';
import TranscriptPanel from '../components/call/TranscriptPanel.jsx';
import ViewMenu from '../components/call/ViewMenu.jsx';
import VideoView from '../components/VideoView.jsx';
import CopyLinkButton from '../components/CopyLinkButton.jsx';
import Alert from '../components/ui/Alert.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Button from '../components/ui/Button.jsx';
import FeatureBoundary from '../components/ui/FeatureBoundary.jsx';
import Input from '../components/ui/Input.jsx';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import Tooltip from '../components/ui/Tooltip.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeetingMedia } from '../context/MeetingMediaContext.jsx';
import useCall from '../hooks/useCall.js';
import { useFeature } from '../hooks/useFeature.js';
import useSlowRequest from '../hooks/useSlowRequest.js';
import { DEFAULT_RTC_CONFIG } from '../webrtc/peer.js';
import {
  isSpeechRecognitionSupported,
  getCaptionsOptIn,
  setCaptionsOptIn,
  SpeechTranscriber,
} from '../utils/speechRecognition.js';

import {
  calculateGalleryItems,
  countHiddenNonVideoPeers,
  filterVisiblePeers,
  formatDuration as formatElapsed,
  selectFeaturedParticipant,
} from '../utils/roomLayout.js';

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

// Polite text for screen readers when someone raises or lowers their hand
function useHandAnnouncements(peers, self) {
  const [text, setText] = useState('');
  const prevHands = useRef(new Map());

  useEffect(() => {
    const current = new Map();
    if (self) {
      current.set('local', { name: self.name || 'You', raised: Boolean(self.handRaised) });
    }
    peers.forEach((p) => {
      current.set(p.peerId, { name: p.user?.name || 'Someone', raised: Boolean(p.handRaised) });
    });

    const messages = [];
    current.forEach(({ name, raised }, id) => {
      const prev = prevHands.current.get(id);
      if (prev && !prev.raised && raised) {
        messages.push(`${name} raised a hand`);
      } else if (prev && prev.raised && !raised) {
        messages.push(`${name} lowered hand`);
      }
    });

    prevHands.current = current;
    if (messages.length) {
      setText(messages.join('. '));
    }
  }, [peers, self?.handRaised, self?.name]);

  return text;
}

export default function CallPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const media = useMeetingMedia();
  const roomViewsEnabled = useFeature('ROOM_VIEWS');
  const reactionsEnabled = useFeature('REACTIONS');
  const pollsEnabled = useFeature('POLLS');
  const captionsEnabled = useFeature('CAPTIONS');

  const location = useLocation();
  const [meeting, setMeeting] = useState(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [peerToRemove, setPeerToRemove] = useState(null);
  const [renamePeerTarget, setRenamePeerTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [captionsActive, setCaptionsActive] = useState(false);
  const [showCaptionsOptIn, setShowCaptionsOptIn] = useState(false);
  const [captionSettings, setCaptionSettings] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('joinus_caption_settings')) || {
          size: 'M',
          position: 'bottom',
        }
      );
    } catch {
      return { size: 'M', position: 'bottom' };
    }
  });
  const transcriberRef = useRef(null);
  const [passcode, setPasscode] = useState(() => {
    try {
      return location.state?.passcode || sessionStorage.getItem(`passcode_${code}`) || '';
    } catch {
      return '';
    }
  });
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [passcodeModalInput, setPasscodeModalInput] = useState('');
  const [directiveToast, setDirectiveToast] = useState(null);
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
  const [pinnedParticipantId, setPinnedParticipantId] = useState(null);
  const [hideNonVideo, setHideNonVideo] = useState(false);

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

  const handleMuteDirective = () => {
    if (media.audioEnabled) {
      media.toggleAudio();
    }
    setDirectiveToast('The host muted your microphone');
    setTimeout(() => setDirectiveToast(null), 4000);
  };

  const handleStopVideoDirective = () => {
    if (media.videoEnabled) {
      media.toggleVideo();
    }
    setDirectiveToast('The host stopped your camera');
    setTimeout(() => setDirectiveToast(null), 4000);
  };

  const call = useCall({
    code,
    passcode,
    localStream: media.stream,
    localMedia: { audio: media.audioEnabled, video: media.videoEnabled },
    enabled: mediaSettled && rtcConfig !== null,
    rtcConfig: rtcConfig ?? DEFAULT_RTC_CONFIG,
    currentUser: user,
    onMuteDirective: handleMuteDirective,
    onStopVideoDirective: handleStopVideoDirective,
  });

  useEffect(() => {
    if (call.securityToast) {
      setDirectiveToast(call.securityToast.message);
      const timer = setTimeout(() => {
        setDirectiveToast(null);
        call.clearSecurityToast?.();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [call.securityToast]);

  useEffect(() => {
    if (mediaStatus === 'idle' && !['ended', 'denied', 'removed'].includes(call.status)) {
      startMedia();
    }
  }, [mediaStatus, startMedia, call.status]);

  const slow = useSlowRequest(call.status === 'connecting' || call.status === 'idle', 4000);
  const localName = user?.name ?? 'You';
  const announcement = useAnnouncement(call.peers);
  const handAnnouncement = useHandAnnouncements(
    call.peers,
    reactionsEnabled ? { name: localName, handRaised: call.selfHandRaised } : null
  );

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

  const [peerToast, setPeerToast] = useState(null);
  const lastPeerToastIdRef = useRef(null);

  useEffect(() => {
    if (call.peerToast && call.peerToast.id !== lastPeerToastIdRef.current) {
      lastPeerToastIdRef.current = call.peerToast.id;
      setPeerToast(call.peerToast.message);
      const timer = setTimeout(() => {
        setPeerToast(null);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [call.peerToast]);

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

  const [searchParams] = useSearchParams();
  const autoShareTriggeredRef = useRef(false);

  useEffect(() => {
    if (
      searchParams.get('startShare') === 'true' &&
      !autoShareTriggeredRef.current &&
      call.status === 'active'
    ) {
      autoShareTriggeredRef.current = true;
      handleStartScreenShare();
    }
  }, [call.status, searchParams]);

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

  useEffect(() => {
    const shouldTranscribe =
      captionsEnabled &&
      captionsActive &&
      inCall &&
      media.audioEnabled &&
      isSpeechRecognitionSupported();

    if (shouldTranscribe) {
      if (!transcriberRef.current) {
        try {
          const transcriber = new SpeechTranscriber({
            onSegment: ({ text, final }) => {
              call.sendCaptionSegment(text, final);
            },
            onError: (err) => {
              console.warn('Speech recognition warning:', err);
            },
          });
          transcriberRef.current = transcriber;
          transcriber.start();
        } catch (err) {
          console.error('Failed to start speech recognition:', err);
        }
      }
    } else {
      if (transcriberRef.current) {
        transcriberRef.current.stop();
        transcriberRef.current = null;
      }
    }

    return () => {
      if (transcriberRef.current) {
        transcriberRef.current.stop();
        transcriberRef.current = null;
      }
    };
  }, [captionsEnabled, captionsActive, inCall, media.audioEnabled]);

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

  // Pinned participant resolution
  const pinnedParticipant = useMemo(() => {
    if (!pinnedParticipantId) return null;
    if (pinnedParticipantId === 'local') return { id: 'local', name: `${localName} (You)` };
    const peer = call.peers.find((p) => p.peerId === pinnedParticipantId);
    return peer ? { id: peer.peerId, name: peer.user?.name ?? 'Guest' } : null;
  }, [pinnedParticipantId, call.peers, localName]);

  // If pinned peer leaves, clear pin
  useEffect(() => {
    if (pinnedParticipantId && pinnedParticipantId !== 'local') {
      const stillHere = call.peers.some((p) => p.peerId === pinnedParticipantId);
      if (!stillHere) setPinnedParticipantId(null);
    }
  }, [call.peers, pinnedParticipantId]);

  // Filter peers based on hideNonVideo setting (pinned peers remain visible)
  const visiblePeers = useMemo(() => {
    if (!roomViewsEnabled) return call.peers;
    return filterVisiblePeers(call.peers, hideNonVideo, pinnedParticipantId);
  }, [call.peers, hideNonVideo, roomViewsEnabled, pinnedParticipantId]);

  const hiddenNonVideoCount =
    hideNonVideo && roomViewsEnabled
      ? countHiddenNonVideoPeers(call.peers, hideNonVideo, pinnedParticipantId)
      : 0;

  // Speaker view featured participant selection
  // Priority: pinned participant > active speaker peer > local
  const { isLocal: isLocalFeatured, featuredPeer } = useMemo(() => {
    return selectFeaturedParticipant({
      pinnedId: pinnedParticipantId,
      activeSpeakerId: call.activeSpeaker,
      peers: call.peers,
    });
  }, [pinnedParticipantId, call.activeSpeaker, call.peers]);

  // Gallery view: up to 4 participants when roomViewsEnabled
  const galleryItems = useMemo(() => {
    return calculateGalleryItems(visiblePeers, roomViewsEnabled, 4);
  }, [visiblePeers, roomViewsEnabled]);

  const activePeer = call.peers.find((p) => p.peerId === call.activeSpeaker);
  const isLocalSpeaking = call.activeSpeaker === 'local' || (!activePeer && !call.peers.length);

  return (
    <div className="call theme-meeting">
      {roomViewsEnabled ? (
        <MeetingHeader
          title={meeting?.title}
          code={code}
          waitingRoom={meeting?.waitingRoom ?? true}
          isLocked={call.isLocked}
          onOpenSecurity={() => setSecurityModalOpen(true)}
          elapsedSeconds={elapsedSeconds}
          isReconnecting={Boolean(call.isReconnecting || call.status === 'reconnecting')}
          viewMode={viewMode}
          onToggleView={() => setViewMode((curr) => (curr === 'gallery' ? 'speaker' : 'gallery'))}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isOtherSharing={isOtherSharing}
          presenterName={presenterName}
          recordingActive={false}
          viewMenuSlot={
            <ViewMenu
              viewMode={viewMode}
              onSelectView={setViewMode}
              pinnedParticipant={pinnedParticipant}
              onUnpin={() => setPinnedParticipantId(null)}
              hideNonVideo={hideNonVideo}
              onToggleHideNonVideo={() => setHideNonVideo((prev) => !prev)}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
            />
          }
        />
      ) : (
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
      )}

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
                reason={call.error?.code || call.state?.reason}
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
                      key={call.screenStream?.id || (call.screenShare ? `${call.screenShare.peerId}-${call.screenShare.streamId}` : 'no-screen')}
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
                      handRaised={reactionsEnabled ? call.selfHandRaised : handRaised}
                      feedback={reactionsEnabled ? call.selfFeedback : null}
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
                        handRaised={peer.handRaised}
                        feedback={peer.feedback}
                      />
                    ))}
                  </div>
                </div>
              ) : viewMode === 'speaker' && (visiblePeers.length > 0 || call.peers.length > 0) ? (
                /* Speaker View: Active speaker or pinned participant prominent, others in sleek filmstrip */
                <div className="call__stage-speaker">
                  {hiddenNonVideoCount > 0 && (
                    <div className="zoom-hidden-non-video-pill" role="status">
                      <span>
                        {hiddenNonVideoCount} non-video participant{hiddenNonVideoCount > 1 ? 's' : ''} hidden
                      </span>
                      <button type="button" onClick={() => setHideNonVideo(false)}>
                        Show
                      </button>
                    </div>
                  )}

                  <div className="call__speaker-filmstrip">
                    {!isLocalFeatured && (
                      <ParticipantTile
                        local
                        name={`${localName} (You)`}
                        stream={media.stream}
                        audioOn={media.audioEnabled}
                        videoOn={media.videoEnabled}
                        isSpeaking={call.activeSpeaker === 'local'}
                        isHost={isHost}
                        handRaised={reactionsEnabled ? call.selfHandRaised : handRaised}
                        feedback={reactionsEnabled ? call.selfFeedback : null}
                        reaction={localReaction}
                        isPinned={pinnedParticipantId === 'local'}
                        onPinToggle={() =>
                          setPinnedParticipantId((curr) => (curr === 'local' ? null : 'local'))
                        }
                      />
                    )}
                    {visiblePeers
                      .filter((p) => isLocalFeatured || p.peerId !== featuredPeer?.peerId)
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
                          handRaised={peer.handRaised}
                          feedback={peer.feedback}
                          isPinned={pinnedParticipantId === peer.peerId}
                          onPinToggle={() =>
                            setPinnedParticipantId((curr) =>
                              curr === peer.peerId ? null : peer.peerId
                            )
                          }
                        />
                      ))}
                  </div>

                  <div className="call__speaker-main">
                    {isLocalFeatured ? (
                      <ParticipantTile
                        local
                        name={`${localName} (You)`}
                        stream={media.stream}
                        audioOn={media.audioEnabled}
                        videoOn={media.videoEnabled}
                        isSpeaking={call.activeSpeaker === 'local'}
                        isHost={isHost}
                        handRaised={reactionsEnabled ? call.selfHandRaised : handRaised}
                        feedback={reactionsEnabled ? call.selfFeedback : null}
                        reaction={localReaction}
                        isPinned={pinnedParticipantId === 'local'}
                        onPinToggle={() =>
                          setPinnedParticipantId((curr) => (curr === 'local' ? null : 'local'))
                        }
                      />
                    ) : featuredPeer ? (
                      <ParticipantTile
                        key={featuredPeer.peerId}
                        name={featuredPeer.user?.name ?? 'Guest'}
                        stream={featuredPeer.stream}
                        audioOn={featuredPeer.audio}
                        videoOn={featuredPeer.video}
                        connectionState={featuredPeer.connectionState}
                        isSpeaking={call.activeSpeaker === featuredPeer.peerId || pinnedParticipantId === featuredPeer.peerId}
                        isHost={featuredPeer.isHost}
                        handRaised={featuredPeer.handRaised}
                        feedback={featuredPeer.feedback}
                        isPinned={pinnedParticipantId === featuredPeer.peerId}
                        onPinToggle={() =>
                          setPinnedParticipantId((curr) =>
                            curr === featuredPeer.peerId ? null : featuredPeer.peerId
                          )
                        }
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                /* Gallery View: Balanced Zoom grid up to 4 */
                <div
                  className="call__grid zoom-grid"
                  data-count={Math.min(galleryItems.length, 4)}
                >
                  {hiddenNonVideoCount > 0 && (
                    <div className="zoom-hidden-non-video-pill" role="status">
                      <span>
                        {hiddenNonVideoCount} non-video participant{hiddenNonVideoCount > 1 ? 's' : ''} hidden
                      </span>
                      <button type="button" onClick={() => setHideNonVideo(false)}>
                        Show
                      </button>
                    </div>
                  )}

                  {galleryItems.map((item) =>
                    item.isLocal ? (
                      <ParticipantTile
                        key="local"
                        local
                        name={`${localName} (You)`}
                        stream={media.stream}
                        audioOn={media.audioEnabled}
                        videoOn={media.videoEnabled}
                        isSpeaking={call.activeSpeaker === 'local'}
                        isHost={isHost}
                        handRaised={reactionsEnabled ? call.selfHandRaised : handRaised}
                        feedback={reactionsEnabled ? call.selfFeedback : null}
                        reaction={localReaction}
                        isPinned={pinnedParticipantId === 'local'}
                        onPinToggle={() =>
                          setPinnedParticipantId((curr) => (curr === 'local' ? null : 'local'))
                        }
                      />
                    ) : (
                      <ParticipantTile
                        key={item.peer.peerId}
                        name={item.peer.user?.name ?? 'Guest'}
                        stream={item.peer.stream}
                        audioOn={item.peer.audio}
                        videoOn={item.peer.video}
                        connectionState={item.peer.connectionState}
                        isSpeaking={call.activeSpeaker === item.peer.peerId}
                        isHost={item.peer.isHost}
                        isCoHost={item.peer.isCoHost}
                        handRaised={item.peer.handRaised}
                        feedback={item.peer.feedback}
                        isPinned={pinnedParticipantId === item.peer.peerId}
                        onPinToggle={() =>
                          setPinnedParticipantId((curr) =>
                            curr === item.peer.peerId ? null : item.peer.peerId
                          )
                        }
                      />
                    )
                  )}
                </div>
              )}
            </>
          )}

          {reactionsEnabled && <FloatingReactions reactions={call.reactions} />}
          {pollsEnabled && inCall && call.activePoll && activePanel !== 'polls' && (
            <ParticipantPollCard
              poll={call.activePoll}
              onSubmitVote={call.submitVote}
              onDismiss={call.dismissActivePoll}
            />
          )}
          {captionsEnabled && inCall && captionsActive && call.liveCaption && (
            <CaptionBar
              caption={call.liveCaption}
              size={captionSettings.size}
              position={captionSettings.position}
              onUpdateSettings={(patch) => {
                setCaptionSettings((prev) => {
                  const next = { ...prev, ...patch };
                  try {
                    localStorage.setItem('joinus_caption_settings', JSON.stringify(next));
                  } catch {}
                  return next;
                });
              }}
              onOpenTranscript={() => setActivePanel('transcript')}
            />
          )}
        </main>

        {inCall && activePanel && (
          <div
            className="call__panel-backdrop"
            onClick={() => setActivePanel(null)}
            aria-hidden="true"
          />
        )}

        {inCall && (
          <div className={`call__panel-slot ${activePanel ? 'is-open' : ''}`}>
            {activePanel === 'participants' && (
              <FeatureBoundary title="Participants panel is unavailable">
                <ParticipantsPanel
                  isOpen={activePanel === 'participants'}
                  onClose={() => setActivePanel(null)}
                  onSwitchToChat={() => setActivePanel('chat')}
                  onSwitchToPolls={() => setActivePanel('polls')}
                  unreadCount={call.unreadCount}
                  isHost={call.isHost}
                  isCoHost={call.isCoHost}
                  canModerate={call.canModerate}
                  self={{
                    name: localName,
                    audioOn: media.audioEnabled,
                    videoOn: media.videoEnabled,
                    handRaised: reactionsEnabled && call.selfHandRaised,
                    feedback: reactionsEnabled && call.selfFeedback,
                  }}
                  peers={call.peers}
                  waitingList={call.waitingList}
                  screenSharer={call.screenShare}
                  onStopHostScreenShare={call.stopHostScreenShare}
                  onAdmit={(peerId) => call.admitPeer(peerId)}
                  onDeny={(peerId) => call.denyPeer(peerId)}
                  onAdmitAll={() => call.admitAllPeers()}
                  onMutePeer={(peerId) => call.mutePeer(peerId)}
                  onRequestUnmute={(peerId) => call.requestUnmute(peerId)}
                  onStopPeerVideo={(peerId) => call.stopPeerVideo(peerId)}
                  onRenamePeer={(peer) => {
                    setRenamePeerTarget(peer);
                    setRenameValue(peer.user?.name ?? '');
                  }}
                  onPromoteCoHost={(peer) => call.promoteCoHost(peer.peerId)}
                  onDemoteCoHost={(peer) => call.demoteCoHost(peer.peerId)}
                  onMuteAll={() => call.muteAllPeers()}
                  onRemove={(peer, block) => setPeerToRemove({ peer, block })}
                  onLowerHand={(peerId) => call.lowerPeerHand(peerId)}
                  onLowerSelfHand={() => call.setHandRaised(false)}
                />
              </FeatureBoundary>
            )}
            {activePanel === 'chat' && (
              <FeatureBoundary title="Chat panel is unavailable">
                <ChatPanel
                  isOpen={activePanel === 'chat'}
                  onClose={() => setActivePanel(null)}
                  onSwitchToParticipants={() => setActivePanel('participants')}
                  onSwitchToPolls={() => setActivePanel('polls')}
                  participantCount={call.peers.length + 1}
                  waitingCount={call.canModerate ? call.waitingList.length : 0}
                  messages={call.messages}
                  currentUser={user}
                  peers={call.peers}
                  historyLoading={call.historyLoading}
                  historyError={call.historyError}
                  rateLimitHint={call.rateLimitHint}
                  chatAllowed={call.roomSettings?.chatAllowed !== false}
                  canModerate={call.canModerate}
                  onSendMessage={call.sendMessage}
                  onRetryMessage={call.retryMessage}
                  onRetryLoadHistory={call.loadHistory}
                />
              </FeatureBoundary>
            )}
            {activePanel === 'polls' && pollsEnabled && (
              <FeatureBoundary title="Polls panel is unavailable">
                <PollsPanel
                  isOpen={activePanel === 'polls'}
                  onClose={() => setActivePanel(null)}
                  onSwitchToParticipants={() => setActivePanel('participants')}
                  onSwitchToChat={() => setActivePanel('chat')}
                  participantCount={call.peers.length + 1}
                  waitingCount={call.canModerate ? call.waitingList.length : 0}
                  unreadCount={call.unreadCount}
                  canModerate={call.canModerate}
                  isHost={call.isHost}
                  activePoll={call.activePoll}
                  meetingCode={code}
                  onCreatePoll={call.createPoll}
                  onLaunchPoll={call.launchPoll}
                  onClosePoll={call.closePoll}
                  onSubmitVote={call.submitVote}
                />
              </FeatureBoundary>
            )}
            {activePanel === 'transcript' && captionsEnabled && (
              <FeatureBoundary title="Transcript panel is unavailable">
                <TranscriptPanel
                  isOpen={activePanel === 'transcript'}
                  onClose={() => setActivePanel(null)}
                  onSwitchToParticipants={() => setActivePanel('participants')}
                  onSwitchToChat={() => setActivePanel('chat')}
                  onSwitchToPolls={pollsEnabled ? () => setActivePanel('polls') : null}
                  participantCount={call.peers.length + 1}
                  waitingCount={call.canModerate ? call.waitingList.length : 0}
                  unreadCount={call.unreadCount}
                  transcript={call.transcript}
                  liveCaption={call.liveCaption}
                  captionsActive={captionsActive}
                  onToggleCaptions={() => {
                    if (!captionsActive) {
                      if (!getCaptionsOptIn()) {
                        setShowCaptionsOptIn(true);
                      } else {
                        setCaptionsActive(true);
                      }
                    } else {
                      setCaptionsActive(false);
                    }
                  }}
                  meetingCode={code}
                />
              </FeatureBoundary>
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
          isPollsOpen={activePanel === 'polls'}
          isTranscriptOpen={activePanel === 'transcript'}
          captionsActive={captionsActive}
          onToggleCaptions={() => {
            if (!captionsActive) {
              if (!getCaptionsOptIn()) {
                setShowCaptionsOptIn(true);
              } else {
                setCaptionsActive(true);
              }
            } else {
              setCaptionsActive(false);
            }
          }}
          onToggleTranscript={() =>
            setActivePanel((curr) => (curr === 'transcript' ? null : 'transcript'))
          }
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
          onTogglePolls={() =>
            setActivePanel((curr) => (curr === 'polls' ? null : 'polls'))
          }
          isHost={call.isHost}
          canModerate={call.canModerate}
          isLocked={call.isLocked}
          roomSettings={call.roomSettings}
          onLockMeeting={(locked) => call.lockMeeting(locked)}
          onUpdateRoomSettings={(settings) => call.updateRoomSettings(settings)}
          onOpenSecurity={() => setSecurityModalOpen(true)}
          handRaised={reactionsEnabled ? call.selfHandRaised : handRaised}
          onToggleHandRaise={() => {
            if (reactionsEnabled) {
              call.setHandRaised(!call.selfHandRaised);
            } else {
              setHandRaised((prev) => !prev);
            }
          }}
          onSendReaction={(kind) => {
            if (reactionsEnabled) {
              call.sendReaction(kind);
            } else {
              setLocalReaction(kind);
            }
          }}
          currentFeedback={reactionsEnabled ? call.selfFeedback : null}
          onSetFeedback={(kind) => {
            if (reactionsEnabled) {
              call.setFeedback(kind);
            }
          }}
          onReplaceTrack={call.replaceTrack}
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

      <div className="call__toasts-stack">
        {inCall && (isHost || call.canModerate) && toastGuest && (
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

        {inCall && (isHost || call.canModerate) && reactionsEnabled && call.handToast && (
          <aside className="call__waiting-toast call__hand-toast" role="status" aria-live="polite">
            <Avatar name={call.handToast.name ?? 'Guest'} size="sm" />
            <span className="call__waiting-toast-text">
              <strong>{call.handToast.name ?? 'Guest'}</strong> raised a hand
            </span>
            <div className="call__waiting-toast-actions">
              {call.handToast.peerId && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    call.lowerPeerHand(call.handToast.peerId);
                    call.clearHandToast();
                  }}
                >
                  Lower hand
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => call.clearHandToast()}
              >
                Dismiss
              </Button>
            </div>
          </aside>
        )}
      </div>

      {/* Remove Confirm Modal */}
      <Modal
        open={Boolean(peerToRemove)}
        onClose={() => setPeerToRemove(null)}
        size="sm"
        title={
          peerToRemove?.block
            ? `Remove and block ${peerToRemove?.peer?.user?.name ?? 'participant'}?`
            : `Remove ${peerToRemove?.peer?.user?.name ?? 'participant'}?`
        }
        description={
          peerToRemove?.block
            ? 'They will be disconnected from the call and blocked from rejoining.'
            : 'They will be disconnected from the call and can ask to join again.'
        }
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
                if (peerToRemove?.peer) {
                  call.removePeer(peerToRemove.peer.peerId, Boolean(peerToRemove.block));
                  setPeerToRemove(null);
                }
              }}
            >
              {peerToRemove?.block ? 'Remove and block' : 'Remove'}
            </Button>
          </>
        }
      />

      {/* Rename Participant Modal */}
      <Modal
        open={Boolean(renamePeerTarget)}
        onClose={() => setRenamePeerTarget(null)}
        size="sm"
        title="Rename participant"
        description="Change display name for this participant in this meeting."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = renameValue.trim();
            if (renamePeerTarget && trimmed) {
              try {
                await call.renamePeer(renamePeerTarget.peerId, trimmed);
              } catch (err) {
                console.error('Failed to rename participant:', err);
              }
              setRenamePeerTarget(null);
            }
          }}
        >
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Input
              id="rename-participant-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Display name"
              autoFocus
              maxLength={50}
            />
          </div>
          <div className="ui-modal__footer" style={{ padding: 0 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRenamePeerTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!renameValue.trim()}
            >
              Rename
            </Button>
          </div>
        </form>
      </Modal>

      {/* Host Request Unmute Prompt Modal */}
      <Modal
        open={Boolean(call.unmuteRequestPrompt)}
        onClose={() => call.dismissUnmuteRequest()}
        size="sm"
        title="Host requested unmute"
        description="The host would like you to unmute your microphone. You can choose to unmute or remain muted."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => call.dismissUnmuteRequest()}
            >
              Stay muted
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!media.audioEnabled) {
                  media.toggleAudio();
                }
                call.dismissUnmuteRequest();
              }}
            >
              Unmute
            </Button>
          </>
        }
      />

      {/* Passcode Required / Invalid Modal */}
      <Modal
        open={
          passcodeModalOpen ||
          call.error?.code === 'PASSCODE_REQUIRED' ||
          call.error?.code === 'PASSCODE_INVALID'
        }
        onClose={() => setPasscodeModalOpen(false)}
        size="sm"
        title="Passcode required"
        description={
          call.error?.code === 'PASSCODE_INVALID'
            ? 'The passcode entered was incorrect. Please try again.'
            : 'This meeting requires a passcode to join.'
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = passcodeModalInput.trim();
            if (trimmed) {
              setPasscode(trimmed);
              try {
                sessionStorage.setItem(`passcode_${code}`, trimmed);
              } catch {}
              setPasscodeModalOpen(false);
              window.location.reload();
            }
          }}
        >
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Input
              id="passcode-modal-input"
              type="password"
              placeholder="Enter passcode (4-10 characters)"
              value={passcodeModalInput}
              onChange={(e) => setPasscodeModalInput(e.target.value)}
              autoFocus
              maxLength={10}
            />
          </div>
          <div className="ui-modal__footer" style={{ padding: 0 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!passcodeModalInput.trim()}
            >
              Join
            </Button>
          </div>
        </form>
      </Modal>

      {/* Directive Toast Banner */}
      {directiveToast && (
        <aside className="call__waiting-toast call__directive-toast" role="status" aria-live="polite">
          <ShieldAlert size={18} aria-hidden="true" />
          <span className="call__waiting-toast-text">{directiveToast}</span>
          <Button variant="ghost" size="sm" onClick={() => setDirectiveToast(null)}>
            Dismiss
          </Button>
        </aside>
      )}

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

      {/* Captions Opt-In Consent Modal */}
      <CaptionsOptInModal
        open={showCaptionsOptIn}
        onConfirm={() => {
          setCaptionsOptIn(true);
          setShowCaptionsOptIn(false);
          setCaptionsActive(true);
        }}
        onCancel={() => setShowCaptionsOptIn(false)}
      />

      {screenToast && (
        <aside className="call__screen-toast" role="status" aria-live="polite">
          <MonitorUp size={16} aria-hidden="true" />
          <span>{screenToast}</span>
        </aside>
      )}

      {peerToast && (
        <aside className="call__peer-toast" role="status" aria-live="polite">
          <User size={14} aria-hidden="true" />
          <span>{peerToast}</span>
        </aside>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {[announcement, handAnnouncement].filter(Boolean).join('. ')}
      </p>
    </div>
  );
}
