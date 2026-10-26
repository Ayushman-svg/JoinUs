import {
  Check,
  Eye,
  EyeOff,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Tv,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function ViewMenu({
  viewMode = 'gallery', // 'gallery' | 'speaker'
  onSelectView,
  pinnedParticipant = null,
  onUnpin,
  hideNonVideo = false,
  onToggleHideNonVideo,
  isFullscreen = false,
  onToggleFullscreen,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="zoom-view-menu-container" ref={menuRef}>
      <button
        type="button"
        className="zoom-view-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="View options menu"
      >
        <LayoutGrid size={15} aria-hidden="true" />
        <span>View</span>
      </button>

      {isOpen && (
        <div className="zoom-view-dropdown" role="menu" aria-label="View options">
          <div className="zoom-view-dropdown__section">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={viewMode === 'speaker'}
              className={`zoom-view-dropdown__item ${viewMode === 'speaker' ? 'is-active' : ''}`}
              onClick={() => {
                onSelectView('speaker');
                setIsOpen(false);
              }}
            >
              <span className="zoom-view-dropdown__icon-slot">
                {viewMode === 'speaker' ? <Check size={14} aria-hidden="true" /> : <Tv size={14} aria-hidden="true" />}
              </span>
              <span>Speaker View</span>
            </button>

            <button
              type="button"
              role="menuitemradio"
              aria-checked={viewMode === 'gallery'}
              className={`zoom-view-dropdown__item ${viewMode === 'gallery' ? 'is-active' : ''}`}
              onClick={() => {
                onSelectView('gallery');
                setIsOpen(false);
              }}
            >
              <span className="zoom-view-dropdown__icon-slot">
                {viewMode === 'gallery' ? <Check size={14} aria-hidden="true" /> : <LayoutGrid size={14} aria-hidden="true" />}
              </span>
              <span>Gallery View</span>
            </button>
          </div>

          <div className="zoom-view-dropdown__divider" />

          <div className="zoom-view-dropdown__section">
            {pinnedParticipant && (
              <button
                type="button"
                role="menuitem"
                className="zoom-view-dropdown__item"
                onClick={() => {
                  onUnpin();
                  setIsOpen(false);
                }}
              >
                <span className="zoom-view-dropdown__icon-slot">
                  <PinOff size={14} aria-hidden="true" />
                </span>
                <span>Unpin {pinnedParticipant.name || 'Participant'}</span>
              </button>
            )}

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={hideNonVideo}
              className={`zoom-view-dropdown__item ${hideNonVideo ? 'is-checked' : ''}`}
              onClick={() => {
                onToggleHideNonVideo();
              }}
            >
              <span className="zoom-view-dropdown__icon-slot">
                {hideNonVideo ? <Check size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
              </span>
              <span>Hide non-video participants</span>
            </button>
          </div>

          <div className="zoom-view-dropdown__divider" />

          <div className="zoom-view-dropdown__section">
            <button
              type="button"
              role="menuitem"
              className="zoom-view-dropdown__item"
              onClick={() => {
                onToggleFullscreen();
                setIsOpen(false);
              }}
            >
              <span className="zoom-view-dropdown__icon-slot">
                {isFullscreen ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
              </span>
              <span>{isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
