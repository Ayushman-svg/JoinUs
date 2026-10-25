import {
  ChevronUp,
  Hand,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  ShieldCheck,
  Smile,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
}) {
  const [showReactions, setShowReactions] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showVideoMenu, setShowVideoMenu] = useState(false);
  const reactionsRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (reactionsRef.current && !reactionsRef.current.contains(e.target)) {
        setShowReactions(false);
      }
    }
    if (showReactions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showReactions]);

  const isWaitingBadge = waitingCount > 0;
  const badgeCount = isWaitingBadge ? waitingCount : participantCount;

  const hasDisplayMedia =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  const audioOn = media.audioEnabled && media.hasAudio;
  const videoOn = media.videoEnabled && media.hasVideo;

  const EMOJIS = ['👏', '👍', '❤️', '😂', '😮', '🎉'];

  return (
    <footer className="zoom-toolbar" role="toolbar" aria-label="Meeting controls">
      {/* Left controls: Audio & Video */}
      <div className="zoom-toolbar__group zoom-toolbar__group--left">
        {/* Audio control with carat */}
        <div className="zoom-control-split">
          <button
            type="button"
            className={`zoom-btn zoom-btn--media ${!audioOn ? 'is-off' : ''}`}
            onClick={media.toggleAudio}
            disabled={!media.hasAudio}
            aria-label={audioOn ? 'Mute audio' : 'Unmute audio'}
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
            aria-label="Audio options"
            onClick={() => setShowAudioMenu((prev) => !prev)}
          >
            <ChevronUp size={12} aria-hidden="true" />
          </button>
          {showAudioMenu && (
            <div className="zoom-menu zoom-menu--up">
              <div className="zoom-menu__header">Select a Microphone</div>
              <div className="zoom-menu__item is-active">✓ Default System Microphone</div>
              <div className="zoom-menu__divider" />
              <button
                type="button"
                className="zoom-menu__item"
                onClick={() => {
                  setShowAudioMenu(false);
                  media.toggleAudio();
                }}
              >
                {audioOn ? 'Mute Microphone' : 'Unmute Microphone'}
              </button>
            </div>
          )}
        </div>

        {/* Video control with carat */}
        <div className="zoom-control-split">
          <button
            type="button"
            className={`zoom-btn zoom-btn--media ${!videoOn ? 'is-off' : ''}`}
            onClick={media.toggleVideo}
            disabled={!media.hasVideo}
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
            aria-label="Video options"
            onClick={() => setShowVideoMenu((prev) => !prev)}
          >
            <ChevronUp size={12} aria-hidden="true" />
          </button>
          {showVideoMenu && (
            <div className="zoom-menu zoom-menu--up">
              <div className="zoom-menu__header">Select a Camera</div>
              <div className="zoom-menu__item is-active">✓ Integrated HD Webcam</div>
              <div className="zoom-menu__divider" />
              <button
                type="button"
                className="zoom-menu__item"
                onClick={() => {
                  setShowVideoMenu(false);
                  media.toggleVideo();
                }}
              >
                {videoOn ? 'Stop Camera' : 'Start Camera'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Center controls */}
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
              <span className="zoom-btn__badge zoom-btn__badge--unread">
                {unreadCount}
              </span>
            )}
          </span>
          <span className="zoom-btn__label">Chat</span>
        </button>

        {/* Share Screen (Zoom's iconic green button) */}
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
            <span className="zoom-btn__label">
              {isSharing ? 'Stop Share' : 'Share Screen'}
            </span>
          </button>
        )}

        {/* Reactions button & Popover */}
        <div className="zoom-control-relative" ref={reactionsRef}>
          <button
            type="button"
            className={`zoom-btn ${showReactions || handRaised ? 'is-active' : ''}`}
            onClick={() => setShowReactions((prev) => !prev)}
            aria-label="Reactions"
            aria-expanded={showReactions}
          >
            <span className="zoom-btn__icon">
              {handRaised ? (
                <Hand size={20} aria-hidden="true" className="icon-hand-active" />
              ) : (
                <Smile size={20} aria-hidden="true" />
              )}
            </span>
            <span className="zoom-btn__label">{handRaised ? 'Lower Hand' : 'Reactions'}</span>
          </button>

          {showReactions && (
            <div className="zoom-reactions-popover" role="dialog" aria-label="Meeting reactions">
              <div className="zoom-reactions-grid">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="zoom-reaction-btn"
                    onClick={() => {
                      onSendReaction?.(emoji);
                      setShowReactions(false);
                    }}
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="zoom-reactions-divider" />
              <button
                type="button"
                className={`zoom-raise-hand-btn ${handRaised ? 'is-raised' : ''}`}
                onClick={() => {
                  onToggleHandRaise?.();
                  setShowReactions(false);
                }}
              >
                <Hand size={18} aria-hidden="true" />
                <span>{handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right controls: End / Leave */}
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
  );
}
