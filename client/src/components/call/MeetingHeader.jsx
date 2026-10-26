import {
  Clock,
  LayoutGrid,
  Lock,
  Maximize2,
  Minimize2,
  MonitorUp,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import Tooltip from '../ui/Tooltip.jsx';

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

export default function MeetingHeader({
  title = 'Meeting',
  code = '',
  waitingRoom = true,
  onOpenSecurity,
  elapsedSeconds = 0,
  isReconnecting = false,
  viewMode = 'gallery',
  onToggleView,
  isFullscreen = false,
  onToggleFullscreen,
  isOtherSharing = false,
  presenterName = 'Participant',
  recordingActive = false,
  viewMenuSlot = null,
}) {
  const displayTitle = title || (code ? `Meeting ${code}` : 'Meeting');

  return (
    <header className="zoom-call-header" role="banner" aria-label="Meeting header">
      <div className="zoom-call-header__left">
        {/* Lock / Waiting-room status icon */}
        <Tooltip
          label={waitingRoom ? 'Waiting room active (locked)' : 'Direct join enabled (unlocked)'}
          side="bottom"
        >
          <button
            type="button"
            className={`zoom-security-shield-btn ${waitingRoom ? 'is-locked' : 'is-unlocked'}`}
            onClick={onOpenSecurity}
            aria-label={waitingRoom ? 'Waiting room active (locked)' : 'Direct join enabled (unlocked)'}
          >
            {waitingRoom ? (
              <Lock size={15} aria-hidden="true" />
            ) : (
              <Unlock size={15} aria-hidden="true" />
            )}
          </button>
        </Tooltip>

        {/* Meeting Title & Timer */}
        <div className="zoom-call-header__info">
          <h1 className="zoom-call-header__title" title={displayTitle}>
            {displayTitle}
          </h1>
          <span className="zoom-call-header__divider" aria-hidden="true">
            |
          </span>
          <span
            className="zoom-call-header__timer"
            title="Elapsed meeting time"
            aria-label={`Elapsed time: ${formatElapsed(elapsedSeconds)}`}
          >
            <Clock size={13} aria-hidden="true" />
            <span>{formatElapsed(elapsedSeconds)}</span>
          </span>
        </div>

        {/* Connection status (using existing reconnect state) */}
        <div className="zoom-call-header__connection-wrapper">
          {isReconnecting ? (
            <span
              className="zoom-call-header__connection is-reconnecting"
              role="status"
              aria-live="polite"
              title="Connection lost, reconnecting to room..."
            >
              <span className="zoom-connection-dot zoom-connection-dot--reconnecting" aria-hidden="true" />
              <span>Reconnecting…</span>
            </span>
          ) : (
            <span
              className="zoom-call-header__connection is-connected"
              role="status"
              title="Connection stable"
            >
              <span className="zoom-connection-dot zoom-connection-dot--connected" aria-hidden="true" />
              <span className="zoom-connection-text">Connected</span>
            </span>
          )}
        </div>

        {/* Slot for recording indicator */}
        <div
          className="zoom-call-header__recording-slot"
          role="status"
          aria-label="Recording indicator slot"
          data-recording={recordingActive ? 'active' : 'inactive'}
        >
          {recordingActive ? (
            <span className="zoom-recording-badge" title="Meeting is being recorded">
              <span className="zoom-recording-dot" aria-hidden="true" />
              <span>REC</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Screen share remote notice if someone is sharing */}
      {isOtherSharing && (
        <aside className="zoom-screen-share-bar zoom-screen-share-bar--remote" role="status">
          <span className="zoom-screen-share-badge zoom-screen-share-badge--remote">
            <MonitorUp size={14} aria-hidden="true" />
            <span>{presenterName} is sharing screen</span>
          </span>
        </aside>
      )}

      {/* Right controls: View menu slot or fallback buttons */}
      <div className="zoom-call-header__right">
        {viewMenuSlot ? (
          viewMenuSlot
        ) : (
          <>
            {onToggleView && (
              <button
                type="button"
                className="zoom-view-btn"
                onClick={onToggleView}
                aria-label={`Switch to ${viewMode === 'gallery' ? 'Speaker View' : 'Gallery View'}`}
              >
                <LayoutGrid size={15} aria-hidden="true" />
                <span>{viewMode === 'gallery' ? 'Speaker View' : 'Gallery View'}</span>
              </button>
            )}
            {onToggleFullscreen && (
              <button
                type="button"
                className="zoom-fullscreen-btn"
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
              >
                {isFullscreen ? (
                  <Minimize2 size={16} aria-hidden="true" />
                ) : (
                  <Maximize2 size={16} aria-hidden="true" />
                )}
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
