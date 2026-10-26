import {
  Check,
  ChevronUp,
  Hand,
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
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFeature } from '../../hooks/useFeature.js';
import MicTestModal from './MicTestModal.jsx';

export default function CallControls({
  media,
  onLeave,
  waitingCount = 0,
  participantCount = 1,
  isPanelOpen = false,
  isChatOpen = false,
  unreadCount = 0,
  isSharing = false,
  someoneElseSharing = false,
  onStartScreenShare,
  onStopScreenShare,
  onToggleParticipants,
  onToggleChat,
  isHost = false,
  onOpenSecurity,
  handRaised = false,
  onToggleHandRaise,
  onSendReaction,
  onReplaceTrack,
}) {
  const reactionsEnabled = useFeature('REACTIONS');
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showVideoMenu, setShowVideoMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMicTestModal, setShowMicTestModal] = useState(false);

  const audioMenuRef = useRef(null);
  const videoMenuRef = useRef(null);
  const moreMenuRef = useRef(null);

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

  return (
    <>
      <footer className="zoom-toolbar" role="toolbar" aria-label="Meeting controls">
        {/* Left controls: Audio & Video */}
        <div className="zoom-toolbar__group zoom-toolbar__group--left">
          {/* Audio control with chevron */}
          <div className="zoom-control-split" ref={audioMenuRef}>
            <button
              type="button"
              className={`zoom-btn zoom-btn--media ${!audioOn ? 'is-off' : ''}`}
              onClick={media?.toggleAudio}
              disabled={!media?.hasAudio}
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
              onClick={media?.toggleVideo}
              disabled={!media?.hasVideo}
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

        {/* Center controls: Security, Participants, Chat, Share, Reactions, More */}
        <div className="zoom-toolbar__group zoom-toolbar__group--center">
          {/* Security button */}
          <button
            type="button"
            className="zoom-btn"
            onClick={onOpenSecurity}
            aria-label="Meeting security"
          >
            <span className="zoom-btn__icon zoom-btn__icon--security">
              <ShieldCheck size={20} aria-hidden="true" />
            </span>
            <span className="zoom-btn__label">Security</span>
          </button>

          {/* Participants button */}
          <button
            type="button"
            className={`zoom-btn ${isPanelOpen ? 'is-active' : ''}`}
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

          {/* Share Screen button (Iconic green button) */}
          {hasDisplayMedia && (
            <button
              type="button"
              className={`zoom-btn zoom-btn--share ${isSharing ? 'is-sharing' : ''}`}
              onClick={isSharing ? onStopScreenShare : onStartScreenShare}
              disabled={someoneElseSharing}
              aria-label={
                isSharing
                  ? 'Stop Share'
                  : someoneElseSharing
                  ? 'Someone else is presenting'
                  : 'Share Screen'
              }
            >
              <span className="zoom-btn__icon">
                <MonitorUp size={20} aria-hidden="true" />
              </span>
              <span className="zoom-btn__label">{isSharing ? 'Stop Share' : 'Share Screen'}</span>
            </button>
          )}

          {/* Reactions slot (disabled until Prompt 4 ships, hidden when flag is off) */}
          {reactionsEnabled && (
            <button
              type="button"
              className="zoom-btn zoom-btn--reactions is-disabled"
              disabled
              aria-label="Reactions"
              title="Reactions (coming in next update)"
            >
              <span className="zoom-btn__icon">
                <Smile size={20} aria-hidden="true" />
              </span>
              <span className="zoom-btn__label">Reactions</span>
            </button>
          )}

          {/* Raise Hand button */}
          {reactionsEnabled && (
            <button
              type="button"
              className={`zoom-btn zoom-btn--raise-hand ${handRaised ? 'is-active is-hand-raised' : ''}`}
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
                className="zoom-menu zoom-menu--up zoom-menu--more"
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
              </div>
            )}
          </div>
        </div>

        {/* Right controls: Red End / Leave */}
        <div className="zoom-toolbar__group zoom-toolbar__group--right">
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
