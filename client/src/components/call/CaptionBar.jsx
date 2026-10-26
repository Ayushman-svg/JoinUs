import { Captions, Settings, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

/**
 * CaptionBar
 * Renders live captions over the stage with speaker name and text (clamped to 2 lines, auto-fading after 5s).
 * Supports size settings (S, M, L) and position (top or bottom).
 */
export default function CaptionBar({
  caption,
  size = 'M',
  position = 'bottom',
  onUpdateSettings,
  onOpenTranscript,
}) {
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);

  // Close settings popover on outside click
  useEffect(() => {
    if (!showSettings) return;
    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  if (!caption || !caption.text) {
    return null;
  }

  const isInterim = !caption.final;

  return (
    <div
      className={`caption-bar-container caption-bar-container--${position} caption-bar-container--size-${size.toLowerCase()}`}
      role="region"
      aria-label="Live captions"
    >
      <div className="caption-bar">
        <div className="caption-bar__content">
          <div className="caption-bar__header">
            <span className="caption-bar__speaker">
              {caption.name || 'Speaker'}
            </span>
            {isInterim && (
              <span className="caption-bar__live-badge" title="Transcribing in real-time">
                Live
              </span>
            )}
          </div>
          <p className={`caption-bar__text ${isInterim ? 'caption-bar__text--interim' : ''}`}>
            {caption.text}
          </p>
        </div>

        <div className="caption-bar__actions" ref={settingsRef}>
          <button
            type="button"
            className="caption-bar__btn"
            onClick={() => setShowSettings((prev) => !prev)}
            aria-label="Caption settings"
            title="Caption settings"
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
          </button>

          {showSettings && (
            <div className="caption-bar__settings-popover" role="dialog" aria-label="Caption settings">
              <div className="caption-bar__settings-header">
                <span>Caption Settings</span>
                <button
                  type="button"
                  className="caption-bar__btn-close"
                  onClick={() => setShowSettings(false)}
                  aria-label="Close settings"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="caption-bar__settings-row">
                <span className="caption-bar__settings-label">Text Size</span>
                <div className="caption-bar__size-options">
                  {['S', 'M', 'L'].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      className={`caption-bar__option-btn ${size === sz ? 'is-active' : ''}`}
                      onClick={() => onUpdateSettings?.({ size: sz })}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <div className="caption-bar__settings-row">
                <span className="caption-bar__settings-label">Position</span>
                <div className="caption-bar__pos-options">
                  <button
                    type="button"
                    className={`caption-bar__option-btn ${position === 'top' ? 'is-active' : ''}`}
                    onClick={() => onUpdateSettings?.({ position: 'top' })}
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    className={`caption-bar__option-btn ${position === 'bottom' ? 'is-active' : ''}`}
                    onClick={() => onUpdateSettings?.({ position: 'bottom' })}
                  >
                    Bottom
                  </button>
                </div>
              </div>

              {onOpenTranscript && (
                <div className="caption-bar__settings-footer">
                  <button
                    type="button"
                    className="caption-bar__transcript-link"
                    onClick={() => {
                      setShowSettings(false);
                      onOpenTranscript();
                    }}
                  >
                    Open Full Transcript
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
