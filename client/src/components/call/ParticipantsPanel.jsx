import { Check, MicOff, MoreVertical, UserMinus, VideoOff, X } from 'lucide-react';

import Avatar from '../ui/Avatar.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Dropdown, { DropdownItem } from '../ui/Dropdown.jsx';
import Tooltip from '../ui/Tooltip.jsx';

export default function ParticipantsPanel({
  isOpen,
  onClose,
  isHost = false,
  self,
  peers = [],
  waitingList = [],
  onAdmit,
  onDeny,
  onAdmitAll,
  onRemove,
  onSwitchToChat,
  unreadCount = 0,
}) {
  const inMeetingCount = peers.length + 1;

  return (
    <aside
      className={`participants-panel ${isOpen ? 'is-open' : ''}`}
      aria-label="Participants"
      aria-hidden={!isOpen}
    >
      <header className="call-panel__header">
        <nav className="call-panel__tabs" role="tablist" aria-label="Meeting panels">
          <button
            type="button"
            role="tab"
            aria-selected={true}
            className="call-panel__tab is-active"
          >
            Participants ({inMeetingCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="call-panel__tab"
            onClick={onSwitchToChat}
          >
            Chat
            {unreadCount > 0 && (
              <span className="call-panel__tab-badge">{unreadCount}</span>
            )}
          </button>
        </nav>
        <Tooltip label="Close panel" side="left">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Close participants panel"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </Tooltip>
      </header>

      <div className="participants-panel__content">
        {/* Waiting section: host only, hidden when empty */}
        {isHost && waitingList.length > 0 && (
          <section className="participants-panel__section" aria-label="Waiting room">
            <div className="participants-panel__section-header">
              <h3 className="participants-panel__section-title">
                Waiting ({waitingList.length})
              </h3>
              {waitingList.length >= 2 && (
                <Button variant="secondary" size="sm" onClick={onAdmitAll}>
                  Admit all
                </Button>
              )}
            </div>

            <ul className="participants-list">
              {waitingList.map((guest) => {
                const name = guest.user?.name ?? 'Guest';
                return (
                  <li key={guest.peerId} className="participants-row">
                    <Avatar name={name} size="sm" />
                    <div className="participants-row__info">
                      <span className="participants-row__name">{name}</span>
                    </div>
                    <div className="participants-row__actions">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onAdmit(guest.peerId)}
                      >
                        Admit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeny(guest.peerId)}
                      >
                        Deny
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* In meeting section */}
        <section className="participants-panel__section" aria-label="In meeting">
          <div className="participants-panel__section-header">
            <h3 className="participants-panel__section-title">
              In meeting ({inMeetingCount})
            </h3>
          </div>

          <ul className="participants-list">
            {/* You (local user) */}
            <li className="participants-row">
              <Avatar name={self.name} size="sm" />
              <div className="participants-row__info">
                <span className="participants-row__name">{self.name}</span>
                <div className="participants-row__badges">
                  <Badge variant="neutral">You</Badge>
                  {isHost && <Badge variant="primary">Host</Badge>}
                </div>
              </div>
              <div className="participants-row__media">
                {!self.audioOn && (
                  <Tooltip label="Microphone off" side="left">
                    <span className="participants-row__icon-off" aria-label="Microphone off">
                      <MicOff size={16} aria-hidden="true" />
                    </span>
                  </Tooltip>
                )}
                {!self.videoOn && (
                  <Tooltip label="Camera off" side="left">
                    <span className="participants-row__icon-off" aria-label="Camera off">
                      <VideoOff size={16} aria-hidden="true" />
                    </span>
                  </Tooltip>
                )}
              </div>
            </li>

            {/* Remote peers */}
            {peers.map((peer) => {
              const name = peer.user?.name ?? 'Guest';
              return (
                <li key={peer.peerId} className="participants-row">
                  <Avatar name={name} size="sm" />
                  <div className="participants-row__info">
                    <span className="participants-row__name">{name}</span>
                    {peer.isHost && (
                      <div className="participants-row__badges">
                        <Badge variant="primary">Host</Badge>
                      </div>
                    )}
                  </div>
                  <div className="participants-row__media">
                    {!peer.audio && (
                      <Tooltip label="Microphone off" side="left">
                        <span className="participants-row__icon-off" aria-label="Microphone off">
                          <MicOff size={16} aria-hidden="true" />
                        </span>
                      </Tooltip>
                    )}
                    {!peer.video && (
                      <Tooltip label="Camera off" side="left">
                        <span className="participants-row__icon-off" aria-label="Camera off">
                          <VideoOff size={16} aria-hidden="true" />
                        </span>
                      </Tooltip>
                    )}

                    {isHost && (
                      <Dropdown
                        label={`Options for ${name}`}
                        align="end"
                        trigger={({ props }) => (
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={`Options for ${name}`}
                            {...props}
                          >
                            <MoreVertical size={16} aria-hidden="true" />
                          </Button>
                        )}
                      >
                        <DropdownItem
                          danger
                          icon={UserMinus}
                          onSelect={() => onRemove(peer)}
                        >
                          Remove from meeting
                        </DropdownItem>
                      </Dropdown>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </aside>
  );
}
