import {
  AlertTriangle,
  BarChart2,
  Captions,
  Check,
  ChevronUp,
  FileText,
  Hand,
  Lock,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  ShieldCheck,
  Smile,
  Users,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFeature } from '../../hooks/useFeature.js';
import { isSpeechRecognitionSupported } from '../../utils/speechRecognition.js';
import MicTestModal from './MicTestModal.jsx';
import ReactionsPopover from './ReactionsPopover.jsx';

export default function CallControls({
  media,
  onLeave,
  waitingCount = 0,
  participantCount = 1,
  isPanelOpen = false,
  isChatOpen = false,
  isPollsOpen = false,
  isTranscriptOpen = false,
  unreadCount = 0,
  isSharing = false,
  someoneElseSharing = false,
  onStartScreenShare,
  onStopScreenShare,
  onToggleParticipants,
  onToggleChat,
  onTogglePolls,
  onToggleTranscript,
  captionsActive = false,
  onToggleCaptions,
  isHost = false,
  canModerate = false,
  isLocked = false,
  roomSettings = null,
  onLockMeeting,
  onUpdateRoomSettings,
  onOpenSecurity,
  handRaised = false,
  onToggleHandRaise,
  onSendReaction,
  currentFeedback = null,
  onSetFeedback,
  onReplaceTrack,
}) {
  const reactionsEnabled = useFeature('REACTIONS');
  const hostSecurityEnabled = useFeature('HOST_SECURITY');
  const pollsEnabled = useFeature('POLLS');
  const captionsEnabled = useFeature('CAPTIONS');
  const speechSupported = isSpeechRecognitionSupported();
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showVideoMenu, setShowVideoMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSecurityMenu, setShowSecurityMenu] = useState(false);
  const [showReactionsPopover, setShowReactionsPopover] = useState(false);
  const [showMicTestModal, setShowMicTestModal] = useState(false);

  const audioMenuRef = useRef(null);
  const videoMenuRef = useRef(null);
  const moreMenuRef = useRef(null);
  const securityMenuRef = useRef(null);

  // Available devices
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);

  const [currentMicId, setCurrentMicId] = useState(() => {
    try {
      return localStorage.getItem('joinus_preferred_mic') || 'default';
    } catch {
      return 'default';
    }
  });
  const [currentCamId, setCurrentCamId] = useState(() => {
    try {
      return localStorage.getItem('joinus_preferred_cam') || 'default';
    } catch {
      return 'default';
    }
  });
  const [currentSpeakerId, setCurrentSpeakerId] = useState(() => {
    try {
      return localStorage.getItem('joinus_preferred_speaker') || 'default';
    } catch {
      return 'default';
    }
  });

  const supportsSetSinkId =
    typeof HTMLMediaElement !== 'undefined' &&
    typeof HTMLMediaElement.prototype.setSinkId === 'function';

  // Enumerate hardware devices
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;

    let mounted = true;
    async function updateDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;
        setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
        setAudioOutputs(devices.filter((d) => d.kind === 'audiooutput'));
        setVideoInputs(devices.filter((d) => d.kind === 'videoinput'));
      } catch {}
    }

    updateDevices();
    navigator.mediaDevices.addEventListener('devicechange', updateDevices);
    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
    };
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target)) {
        setShowAudioMenu(false);
      }
      if (videoMenuRef.current && !videoMenuRef.current.contains(e.target)) {
        setShowVideoMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
      if (securityMenuRef.current && !securityMenuRef.current.contains(e.target)) {
        setShowSecurityMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Switch microphone using replaceTrack
  async function handleSelectMic(deviceId) {
    setShowAudioMenu(false);
    setCurrentMicId(deviceId);
    try {
      localStorage.setItem('joinus_preferred_mic', deviceId);
    } catch {}

    if (media?.switchDevice) {
      const newTrack = await media.switchDevice('audio', deviceId);
      if (newTrack && onReplaceTrack) {
        await onReplaceTrack('audio', newTrack);
      }
    }
  }

  // Switch camera using replaceTrack
  async function handleSelectCam(deviceId) {
    setShowVideoMenu(false);
    setCurrentCamId(deviceId);
    try {
      localStorage.setItem('joinus_preferred_cam', deviceId);
    } catch {}

    if (media?.switchDevice) {
      const newTrack = await media.switchDevice('video', deviceId);
      if (newTrack && onReplaceTrack) {
        await onReplaceTrack('video', newTrack);
      }
    }
  }

  // Switch audio output (speaker)
  async function handleSelectSpeaker(deviceId) {
    setShowAudioMenu(false);
    setCurrentSpeakerId(deviceId);
    try {
      localStorage.setItem('joinus_preferred_speaker', deviceId);
      if (supportsSetSinkId) {
        const elements = document.querySelectorAll('audio, video');
        for (const el of elements) {
          if (typeof el.setSinkId === 'function') {
            await el.setSinkId(deviceId).catch(() => {});
          }
        }
      }
    } catch {}
  }

  const isWaitingBadge = waitingCount > 0;
  const badgeCount = isWaitingBadge ? waitingCount : participantCount;

  const hasDisplayMedia =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  const audioOn = media?.audioEnabled && media?.hasAudio;
  const videoOn = media?.videoEnabled && media?.hasVideo;

  const activeSpeakerName =
    audioOutputs.find((d) => d.deviceId === currentSpeakerId)?.label || 'System Default Speaker';

  const [permissionNotice, setPermissionNotice] = useState(null);
  const permissionTimerRef = useRef(null);

  const showPermissionNotice = (kind) => {
    if (permissionTimerRef.current) clearTimeout(permissionTimerRef.current);
    const label = kind === 'video' ? 'Camera' : 'Microphone';
    setPermissionNotice({
      kind,
      message: `${label} access is blocked in Chrome. Click the site settings / lock icon in your address bar to allow ${label.toLowerCase()} permission, then try again.`,
    });
    permissionTimerRef.current = setTimeout(() => {
      setPermissionNotice(null);
    }, 8000);
  };

  const handleAudioClick = async () => {
    if (media?.hasAudio) {
      media.toggleAudio();
    } else {
      try {
        const stream = await media?.start?.();
        if (!stream || !stream.getAudioTracks().length) {
          showPermissionNotice('audio');
        }
      } catch {
        showPermissionNotice('audio');
      }
    }
  };

  const handleVideoClick = async () => {
    if (media?.hasVideo) {
      media.toggleVideo();
    } else {
      try {
        const stream = await media?.start?.();
        if (!stream || !stream.getVideoTracks().length) {
          showPermissionNotice('video');
        }
      } catch {
        showPermissionNotice('video');
      }
    }
  };

  return (
    <>
      {permissionNotice && (
        <aside className="zoom-permission-toast" role="alert">
          <AlertTriangle size={18} className="zoom-permission-toast__icon" aria-hidden="true" />
          <div className="zoom-permission-toast__content">
            {permissionNotice.message}
          </div>
          <button
            type="button"
            className="zoom-permission-toast__close"
            onClick={() => setPermissionNotice(null)}
            aria-label="Dismiss notification"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </aside>
      )}
      <footer className="zoom-toolbar" role="toolbar" aria-label="Meeting controls">
        {/* Left controls: Audio & Video */}
        <div className="zoom-toolbar__group zoom-toolbar__group--left">
          {/* Audio control with chevron */}
          <div className="zoom-control-split" ref={audioMenuRef}>
            <button
              type="button"
              className={`zoom-btn zoom-btn--media ${!audioOn ? 'is-off' : ''}`}
              onClick={handleAudioClick}
              aria-label={audioOn ? 'Mute' : 'Unmute'}
            >
              <span className="zoom-btn__icon">
                {audioOn ? (
                  <Mic size={20} aria-hidden="true" />
                ) : (
                  <MicOff size={20} aria-hidden="true" className="icon-danger" />
                )}
              </span>
              <span className="zoom-btn__label">{audioOn ? 'Mute' : 'Unmute'}</span>
            </button>
            <button
              type="button"
              className="zoom-btn__carat"
              aria-label="Microphone and speaker settings"
              aria-expanded={showAudioMenu}
              onClick={() => setShowAudioMenu((prev) => !prev)}
            >
              <ChevronUp size={12} aria-hidden="true" />
            </button>

            {showAudioMenu && (
              <div
                className="zoom-menu zoom-menu--up"
                role="menu"
                aria-label="Select audio devices"
              >
                <div className="zoom-menu__header">Select a Microphone</div>
                {audioInputs.length === 0 ? (
                  <div className="zoom-menu__item is-active">
                    <span className="zoom-menu__check-slot">
                      <Check size={13} aria-hidden="true" />
                    </span>
                    <span>Default Microphone</span>
                  </div>
                ) : (
                  audioInputs.map((d, index) => {
                    const isSelected =
                      d.deviceId === currentMicId ||
                      (!currentMicId && index === 0) ||
                      (currentMicId === 'default' && index === 0);
                    return (
                      <button
                        key={d.deviceId || index}
                        type="button"
                        className={`zoom-menu__item ${isSelected ? 'is-active' : ''}`}
                        onClick={() => handleSelectMic(d.deviceId)}
                      >
                        <span className="zoom-menu__check-slot">
                          {isSelected && <Check size={13} aria-hidden="true" />}
                        </span>
                        <span className="zoom-menu__device-name">
                          {d.label || `Microphone ${index + 1}`}
                        </span>
                      </button>
                    );
                  })
                )}

                {supportsSetSinkId && audioOutputs.length > 0 && (
                  <>
                    <div className="zoom-menu__divider" />
                    <div className="zoom-menu__header">Select a Speaker</div>
                    {audioOutputs.map((d, index) => {
                      const isSelected =
                        d.deviceId === currentSpeakerId ||
                        (!currentSpeakerId && index === 0) ||
                        (currentSpeakerId === 'default' && index === 0);
                      return (
                        <button
                          key={d.deviceId || index}
                          type="button"
                          className={`zoom-menu__item ${isSelected ? 'is-active' : ''}`}
                          onClick={() => handleSelectSpeaker(d.deviceId)}
                        >
                          <span className="zoom-menu__check-slot">
                            {isSelected && <Check size={13} aria-hidden="true" />}
                          </span>
                          <span className="zoom-menu__device-name">
                            {d.label || `Speaker ${index + 1}`}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}

                <div className="zoom-menu__divider" />
                <button
                  type="button"
                  className="zoom-menu__item"
                  onClick={() => {
                    setShowAudioMenu(false);
                    setShowMicTestModal(true);
                  }}
                >
                  <span className="zoom-menu__check-slot" />
                  <span>Test Speaker &amp; Microphone…</span>
                </button>
              </div>
            )}
          </div>

          {/* Video control with chevron */}
          <div className="zoom-control-split" ref={videoMenuRef}>
            <button
              type="button"
              className={`zoom-btn zoom-btn--media ${!videoOn ? 'is-off' : ''}`}
              onClick={handleVideoClick}
              aria-label={videoOn ? 'Stop Video' : 'Start Video'}
            >
              <span className="zoom-btn__icon">
                {videoOn ? (
                  <Video size={20} aria-hidden="true" />
                ) : (
                  <VideoOff size={20} aria-hidden="true" className="icon-danger" />
                )}
              </span>
              <span className="zoom-btn__label">{videoOn ? 'Stop Video' : 'Start Video'}</span>
            </button>
            <button
              type="button"
              className="zoom-btn__carat"
              aria-label="Camera settings"
              aria-expanded={showVideoMenu}
              onClick={() => setShowVideoMenu((prev) => !prev)}
            >
              <ChevronUp size={12} aria-hidden="true" />
            </button>

            {showVideoMenu && (
              <div className="zoom-menu zoom-menu--up" role="menu" aria-label="Select a camera">
                <div className="zoom-menu__header">Select a Camera</div>
                {videoInputs.length === 0 ? (
                  <div className="zoom-menu__item is-active">
                    <span className="zoom-menu__check-slot">
                      <Check size={13} aria-hidden="true" />
                    </span>
                    <span>Integrated HD Camera</span>
                  </div>
                ) : (
                  videoInputs.map((d, index) => {
                    const isSelected =
                      d.deviceId === currentCamId ||
                      (!currentCamId && index === 0) ||
                      (currentCamId === 'default' && index === 0);
                    return (
                      <button
                        key={d.deviceId || index}
                        type="button"
                        className={`zoom-menu__item ${isSelected ? 'is-active' : ''}`}
                        onClick={() => handleSelectCam(d.deviceId)}
                      >
                        <span className="zoom-menu__check-slot">
                          {isSelected && <Check size={13} aria-hidden="true" />}
                        </span>
                        <span className="zoom-menu__device-name">
                          {d.label || `Camera ${index + 1}`}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center controls: Security, Participants, Share, Chat, Reactions, More */}
        <div className="zoom-toolbar__group zoom-toolbar__group--center">
          {/* Security button (desktop only) */}
          <div className="zoom-control-relative" ref={securityMenuRef}>
            <button
              type="button"
              className={`zoom-btn zoom-btn--desktop-only ${showSecurityMenu ? 'is-active' : ''}`}
              onClick={() => {
                if (canModerate) {
                  setShowSecurityMenu((prev) => !prev);
                } else {
                  onOpenSecurity?.();
                }
              }}
              aria-label="Meeting security"
              aria-expanded={showSecurityMenu}
            >
              <span className="zoom-btn__icon zoom-btn__icon--security">
                <ShieldCheck size={20} aria-hidden="true" />
              </span>
              <span className="zoom-btn__label">Security</span>
            </button>

            {showSecurityMenu && canModerate && (
              <div
                className="zoom-menu zoom-menu--up zoom-menu--security"
                role="menu"
                aria-label="Security controls"
              >
                <div className="zoom-menu__header">Security</div>
                <button
                  type="button"
                  className="zoom-menu__item"
                  onClick={() => onLockMeeting?.(!isLocked)}
                  role="menuitemcheckbox"
                  aria-checked={isLocked}
                >
                  <span className="zoom-menu__check-slot">
                    {isLocked && <Check size={13} aria-hidden="true" />}
                  </span>
                  <span className="zoom-menu__item-content">
                    <Lock size={14} aria-hidden="true" />
                    <span>Lock Meeting</span>
                  </span>
                </button>

                <div className="zoom-menu__divider" />
                <div className="zoom-menu__header">Allow participants to:</div>

                <button
                  type="button"
                  className="zoom-menu__item"
                  onClick={() =>
                    onUpdateRoomSettings?.({
                      shareAllowed: roomSettings?.shareAllowed === 'all' ? 'host-only' : 'all',
                    })
                  }
                  role="menuitemcheckbox"
                  aria-checked={roomSettings?.shareAllowed !== 'host-only'}
                >
                  <span className="zoom-menu__check-slot">
                    {roomSettings?.shareAllowed !== 'host-only' && (
                      <Check size={13} aria-hidden="true" />
                    )}
                  </span>
                  <span className="zoom-menu__item-content">
                    <MonitorUp size={14} aria-hidden="true" />
                    <span>Share Screen</span>
                  </span>
                </button>

                <button
                  type="button"
                  className="zoom-menu__item"
                  onClick={() =>
                    onUpdateRoomSettings?.({
                      chatAllowed: roomSettings?.chatAllowed !== false ? false : true,
                    })
                  }
                  role="menuitemcheckbox"
                  aria-checked={roomSettings?.chatAllowed !== false}
                >
                  <span className="zoom-menu__check-slot">
                    {roomSettings?.chatAllowed !== false && (
                      <Check size={13} aria-hidden="true" />
                    )}
                  </span>
                  <span className="zoom-menu__item-content">
                    <MessageSquare size={14} aria-hidden="true" />
                    <span>Chat</span>
                  </span>
                </button>

                <button
                  type="button"
                  className="zoom-menu__item"
                  onClick={() =>
                    onUpdateRoomSettings?.({
                      muteOnEntry: !roomSettings?.muteOnEntry,
                    })
                  }
                  role="menuitemcheckbox"
                  aria-checked={Boolean(roomSettings?.muteOnEntry)}
                >
                  <span className="zoom-menu__check-slot">
                    {roomSettings?.muteOnEntry && (
                      <Check size={13} aria-hidden="true" />
                    )}
                  </span>
                  <span className="zoom-menu__item-content">
                    <MicOff size={14} aria-hidden="true" />
                    <span>Mute on entry</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Participants button (desktop only) */}
          <button
            type="button"
            className={`zoom-btn zoom-btn--desktop-only ${isPanelOpen ? 'is-active' : ''}`}
            onClick={onToggleParticipants}
            aria-label={`Participants (${badgeCount})`}
            aria-pressed={isPanelOpen}
          >
            <span className="zoom-btn__icon">
              <Users size={20} aria-hidden="true" />
              <span
                className={`zoom-btn__badge ${
                  isWaitingBadge ? 'zoom-btn__badge--waiting' : ''
                }`}
              >
                {badgeCount}
              </span>
            </span>
            <span className="zoom-btn__label">Participants</span>
          </button>

          {/* Share Screen button (Iconic green button) */}
          {hasDisplayMedia && (
            <button
              type="button"
              className={`zoom-btn zoom-btn--share ${isSharing ? 'is-sharing' : ''}`}
              onClick={isSharing ? onStopScreenShare : onStartScreenShare}
              disabled={someoneElseSharing || (roomSettings?.shareAllowed === 'host-only' && !canModerate)}
              aria-label={
                isSharing
                  ? 'Stop Share'
                  : someoneElseSharing
                  ? 'Someone else is presenting'
                  : roomSettings?.shareAllowed === 'host-only' && !canModerate
                  ? 'Screen sharing limited to hosts'
                  : 'Share Screen'
              }
            >
              <span className="zoom-btn__icon">
                <MonitorUp size={20} aria-hidden="true" />
              </span>
              <span className="zoom-btn__label">{isSharing ? 'Stop Share' : 'Share Screen'}</span>
            </button>
          )}

          {/* Chat button */}
          <button
            type="button"
            className={`zoom-btn ${isChatOpen ? 'is-active' : ''}`}
            onClick={onToggleChat}
            aria-label={unreadCount > 0 ? `Chat (${unreadCount} unread)` : 'Chat'}
            aria-pressed={isChatOpen}
          >
            <span className="zoom-btn__icon">
              <MessageSquare size={20} aria-hidden="true" />
              {unreadCount > 0 && !isChatOpen && (
                <span className="zoom-btn__badge zoom-btn__badge--unread">{unreadCount}</span>
              )}
            </span>
            <span className="zoom-btn__label">Chat</span>
          </button>

          {/* Polls button */}
          {pollsEnabled && (
            <button
              type="button"
              className={`zoom-btn ${isPollsOpen ? 'is-active' : ''}`}
              onClick={onTogglePolls}
              aria-label="Polls"
              aria-pressed={isPollsOpen}
            >
              <span className="zoom-btn__icon">
                <BarChart2 size={20} aria-hidden="true" />
              </span>
              <span className="zoom-btn__label">Polls</span>
            </button>
          )}

          {/* Captions button */}
          {captionsEnabled && speechSupported && (
            <button
              type="button"
              className={`zoom-btn ${captionsActive ? 'is-active' : ''}`}
              onClick={onToggleCaptions}
              aria-label={captionsActive ? 'Turn off Captions' : 'Turn on Captions'}
              aria-pressed={captionsActive}
            >
              <span className="zoom-btn__icon">
                <Captions size={20} aria-hidden="true" />
              </span>
              <span className="zoom-btn__label">Captions</span>
            </button>
          )}

          {/* Reactions button & Popover */}
          {reactionsEnabled && (
            <div className="zoom-control-relative">
              <button
                type="button"
                className={`zoom-btn zoom-btn--reactions zoom-btn--desktop-only ${showReactionsPopover ? 'is-active' : ''}`}
                onClick={() => setShowReactionsPopover((prev) => !prev)}
                aria-label="Reactions"
                aria-expanded={showReactionsPopover}
              >
                <span className="zoom-btn__icon">
                  <Smile size={20} aria-hidden="true" />
                </span>
                <span className="zoom-btn__label">Reactions</span>
              </button>
              <ReactionsPopover
                open={showReactionsPopover}
                onClose={() => setShowReactionsPopover(false)}
                onSendReaction={(kind) => {
                  onSendReaction?.(kind);
                }}
                handRaised={handRaised}
                onToggleHandRaise={onToggleHandRaise}
                currentFeedback={currentFeedback}
                onSetFeedback={onSetFeedback}
              />
            </div>
          )}

          {/* Raise Hand button */}
          {reactionsEnabled && (
            <button
              type="button"
              className={`zoom-btn zoom-btn--raise-hand zoom-btn--desktop-only ${handRaised ? 'is-active is-hand-raised' : ''}`}
              onClick={onToggleHandRaise}
              aria-label={handRaised ? 'Lower Hand' : 'Raise Hand'}
              aria-pressed={handRaised}
            >
              <span className="zoom-btn__icon">
                <Hand size={20} aria-hidden="true" className={handRaised ? 'icon-hand-active' : ''} />
              </span>
              <span className="zoom-btn__label">{handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
            </button>
          )}

          {/* More options menu */}
          <div className="zoom-control-relative" ref={moreMenuRef}>
            <button
              type="button"
              className={`zoom-btn ${showMoreMenu ? 'is-active' : ''}`}
              onClick={() => setShowMoreMenu((prev) => !prev)}
              aria-label="More meeting controls"
              aria-expanded={showMoreMenu}
            >
              <span className="zoom-btn__icon">
                <MoreHorizontal size={20} aria-hidden="true" />
              </span>
              <span className="zoom-btn__label">More</span>
            </button>

            {showMoreMenu && (
              <div
                className="zoom-menu zoom-menu--up zoom-menu--more zoom-menu--desktop-only"
                role="menu"
                aria-label="More options"
              >
                <button
                  type="button"
                  className="zoom-menu__item"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenSecurity?.();
                  }}
                >
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>Security</span>
                </button>
                <button
                  type="button"
                  className="zoom-menu__item"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowMicTestModal(true);
                  }}
                >
                  <Mic size={16} aria-hidden="true" />
                  <span>Test Audio…</span>
                </button>
                {pollsEnabled && (
                  <button
                    type="button"
                    className="zoom-menu__item"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onTogglePolls?.();
                    }}
                  >
                    <BarChart2 size={16} aria-hidden="true" />
                    <span>Polls</span>
                  </button>
                )}
                {captionsEnabled && (
                  <button
                    type="button"
                    className="zoom-menu__item"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onToggleCaptions?.();
                    }}
                  >
                    <Captions size={16} aria-hidden="true" />
                    <span>{captionsActive ? 'Turn off Captions' : 'Turn on Captions'}</span>
                  </button>
                )}
                {captionsEnabled && (
                  <button
                    type="button"
                    className="zoom-menu__item"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onToggleTranscript?.();
                    }}
                  >
                    <FileText size={16} aria-hidden="true" />
                    <span>Transcript</span>
                  </button>
                )}
                {reactionsEnabled && (
                  <button
                    type="button"
                    className="zoom-menu__item"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowReactionsPopover(true);
                    }}
                  >
                    <Smile size={16} aria-hidden="true" />
                    <span>Reactions</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right controls: Red End / Leave */}
        <div className="zoom-toolbar__group zoom-toolbar__group--right zoom-toolbar__group--desktop-only">
          <button
            type="button"
            className="zoom-end-btn"
            onClick={onLeave}
            aria-label={isHost ? 'End Meeting for All' : 'Leave Meeting'}
          >
            {isHost ? 'End' : 'Leave'}
          </button>
        </div>
      </footer>

      {/* Mobile More Bottom Sheet (shown on mobile when More button is tapped) */}
      {showMoreMenu && (
        <div
          className="zoom-mobile-more-backdrop"
          onClick={() => setShowMoreMenu(false)}
          role="presentation"
        >
          <div
            className="zoom-mobile-more-sheet"
            role="dialog"
            aria-label="More meeting options"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="zoom-sheet-handle" aria-hidden="true" />
            <div className="zoom-sheet-header">
              <h3 className="zoom-sheet-title">Meeting Options</h3>
              <button
                type="button"
                className="zoom-sheet-close"
                onClick={() => setShowMoreMenu(false)}
                aria-label="Close options"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="zoom-sheet-body">
              {/* Participants */}
              <button
                type="button"
                className="zoom-sheet-item"
                onClick={() => {
                  setShowMoreMenu(false);
                  onToggleParticipants();
                }}
              >
                <span className="zoom-sheet-item__icon">
                  <Users size={20} aria-hidden="true" />
                </span>
                <span className="zoom-sheet-item__label">Participants</span>
                <span className="zoom-sheet-item__badge">{badgeCount}</span>
              </button>

              {/* Polls (if enabled) */}
              {pollsEnabled && (
                <button
                  type="button"
                  className="zoom-sheet-item"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onTogglePolls?.();
                  }}
                >
                  <span className="zoom-sheet-item__icon">
                    <BarChart2 size={20} aria-hidden="true" />
                  </span>
                  <span className="zoom-sheet-item__label">Polls</span>
                </button>
              )}

              {/* Captions (if enabled & speech supported) */}
              {captionsEnabled && speechSupported && (
                <button
                  type="button"
                  className={`zoom-sheet-item ${captionsActive ? 'is-active' : ''}`}
                  onClick={() => {
                    setShowMoreMenu(false);
                    onToggleCaptions?.();
                  }}
                >
                  <span className="zoom-sheet-item__icon">
                    <Captions size={20} aria-hidden="true" />
                  </span>
                  <span className="zoom-sheet-item__label">
                    {captionsActive ? 'Turn off Captions' : 'Turn on Captions'}
                  </span>
                </button>
              )}

              {/* Transcript (if enabled) */}
              {captionsEnabled && (
                <button
                  type="button"
                  className="zoom-sheet-item"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onToggleTranscript?.();
                  }}
                >
                  <span className="zoom-sheet-item__icon">
                    <FileText size={20} aria-hidden="true" />
                  </span>
                  <span className="zoom-sheet-item__label">Transcript</span>
                </button>
              )}

              {/* Security */}
              <button
                type="button"
                className="zoom-sheet-item"
                onClick={() => {
                  setShowMoreMenu(false);
                  onOpenSecurity();
                }}
              >
                <span className="zoom-sheet-item__icon">
                  <ShieldCheck size={20} aria-hidden="true" />
                </span>
                <span className="zoom-sheet-item__label">Security</span>
              </button>

              {/* Test Audio */}
              <button
                type="button"
                className="zoom-sheet-item"
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowMicTestModal(true);
                }}
              >
                <span className="zoom-sheet-item__icon">
                  <Mic size={20} aria-hidden="true" />
                </span>
                <span className="zoom-sheet-item__label">Test Speaker &amp; Microphone</span>
              </button>

              {/* Raise Hand (if enabled) */}
              {reactionsEnabled && (
                <button
                  type="button"
                  className="zoom-sheet-item"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onToggleHandRaise?.();
                  }}
                >
                  <span className="zoom-sheet-item__icon">
                    <Hand size={20} aria-hidden="true" />
                  </span>
                  <span className="zoom-sheet-item__label">
                    {handRaised ? 'Lower Hand' : 'Raise Hand'}
                  </span>
                </button>
              )}

              {/* Reactions & Feedback (if enabled) */}
              {reactionsEnabled && (
                <div className="zoom-sheet-reactions-section">
                  <span className="zoom-sheet-section-title">Reactions</span>
                  <div className="zoom-sheet-reactions-row">
                    {[
                      { kind: 'thumbs-up', emoji: '👍' },
                      { kind: 'clap', emoji: '👏' },
                      { kind: 'heart', emoji: '❤️' },
                      { kind: 'laugh', emoji: '😂' },
                      { kind: 'celebrate', emoji: '🎉' },
                    ].map((opt) => (
                      <button
                        key={opt.kind}
                        type="button"
                        className="zoom-sheet-reaction-btn"
                        onClick={() => {
                          setShowMoreMenu(false);
                          onSendReaction?.(opt.kind);
                        }}
                      >
                        <span aria-hidden="true">{opt.emoji}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="zoom-sheet-divider" />

              {/* End / Leave button */}
              <button
                type="button"
                className="zoom-sheet-item zoom-sheet-item--danger"
                onClick={() => {
                  setShowMoreMenu(false);
                  onLeave?.();
                }}
              >
                <span className="zoom-sheet-item__icon">
                  <LogOut size={20} aria-hidden="true" />
                </span>
                <span className="zoom-sheet-item__label">
                  {isHost ? 'End Meeting for All' : 'Leave Meeting'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microphone and Speaker Test Modal */}
      <MicTestModal
        open={showMicTestModal}
        onClose={() => setShowMicTestModal(false)}
        stream={media?.stream}
        speakerName={activeSpeakerName}
      />
    </>
  );
}
