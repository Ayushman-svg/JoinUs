import {
  Ban,
  Check,
  ChevronsDown,
  ChevronsUp,
  Coffee,
  Edit2,
  Hand,
  Mic,
  MicOff,
  MonitorOff,
  MoreVertical,
  UserCheck,
  UserMinus,
  VideoOff,
  X,
} from 'lucide-react';
import { useMemo } from 'react';

import Avatar from '../ui/Avatar.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Dropdown, { DropdownItem } from '../ui/Dropdown.jsx';
import Tooltip from '../ui/Tooltip.jsx';
import { useFeature } from '../../hooks/useFeature.js';

export default function ParticipantsPanel({
  isOpen,
  onClose,
  isHost = false,
  isCoHost = false,
  canModerate = isHost || isCoHost,
  self,
  peers = [],
  waitingList = [],
  screenSharer = null,
  onStopHostScreenShare,
  onAdmit,
  onDeny,
  onAdmitAll,
  onRemove,
  onMutePeer,
  onRequestUnmute,
  onStopPeerVideo,
  onRenamePeer,
  onPromoteCoHost,
  onDemoteCoHost,
  onMuteAll,
  onSwitchToChat,
  unreadCount = 0,
  onLowerHand,
  onLowerSelfHand,
}) {
  const reactionsEnabled = useFeature('REACTIONS');
  const inMeetingCount = peers.length + 1;

  const sortedPeers = useMemo(() => {
    if (!reactionsEnabled) return peers;
    return [...peers].sort((a, b) => {
      const aRaised = Boolean(a.handRaised);
      const bRaised = Boolean(b.handRaised);
      if (aRaised && !bRaised) return -1;
      if (!aRaised && bRaised) return 1;
      if (aRaised && bRaised) {
        const timeA = a.raisedAt ? new Date(a.raisedAt).getTime() : 0;
        const timeB = b.raisedAt ? new Date(b.raisedAt).getTime() : 0;
        return timeA - timeB;
      }
      return 0;
    });
  }, [peers, reactionsEnabled]);

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
        {/* Waiting section: moderator only, hidden when empty */}
        {canModerate && waitingList.length > 0 && (
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
                  {!isHost && isCoHost && <Badge variant="secondary" className="badge--cohost">Co-host</Badge>}
                  {reactionsEnabled && self.handRaised && (
                    <span className="participants-row__hand-badge" role="status" title="Hand raised">
                      <Hand size={12} aria-hidden="true" />
                      <span>Raised</span>
                    </span>
                  )}
                  {reactionsEnabled && self.feedback && (
                    <span
                      className={`participants-row__feedback-badge participants-row__feedback-badge--${self.feedback}`}
                      title={`Feedback: ${self.feedback}`}
                    >
                      {self.feedback === 'yes' && <Check size={11} aria-hidden="true" />}
                      {self.feedback === 'no' && <X size={11} aria-hidden="true" />}
                      {self.feedback === 'slower' && <ChevronsDown size={11} aria-hidden="true" />}
                      {self.feedback === 'faster' && <ChevronsUp size={11} aria-hidden="true" />}
                      {self.feedback === 'break' && <Coffee size={11} aria-hidden="true" />}
                      <span>{self.feedback}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="participants-row__media">
                {reactionsEnabled && self.handRaised && onLowerSelfHand && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onLowerSelfHand}
                    aria-label="Lower hand"
                    className="participants-row__lower-hand-btn"
                  >
                    Lower hand
                  </Button>
                )}
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
            {sortedPeers.map((peer) => {
              const name = peer.user?.name ?? 'Guest';
              const isPresenting = screenSharer?.peerId === peer.peerId;
              return (
                <li key={peer.peerId} className="participants-row">
                  <Avatar name={name} size="sm" />
                  <div className="participants-row__info">
                    <span className="participants-row__name">{name}</span>
                    <div className="participants-row__badges">
                      {peer.isHost && <Badge variant="primary">Host</Badge>}
                      {!peer.isHost && peer.isCoHost && (
                        <Badge variant="secondary" className="badge--cohost">
                          Co-host
                        </Badge>
                      )}
                      {isPresenting && <Badge variant="primary">Presenting</Badge>}
                      {reactionsEnabled && peer.handRaised && (
                        <span className="participants-row__hand-badge" role="status" title="Hand raised">
                          <Hand size={12} aria-hidden="true" />
                          <span>Raised</span>
                        </span>
                      )}
                      {reactionsEnabled && peer.feedback && (
                        <span
                          className={`participants-row__feedback-badge participants-row__feedback-badge--${peer.feedback}`}
                          title={`Feedback: ${peer.feedback}`}
                        >
                          {peer.feedback === 'yes' && <Check size={11} aria-hidden="true" />}
                          {peer.feedback === 'no' && <X size={11} aria-hidden="true" />}
                          {peer.feedback === 'slower' && <ChevronsDown size={11} aria-hidden="true" />}
                          {peer.feedback === 'faster' && <ChevronsUp size={11} aria-hidden="true" />}
                          {peer.feedback === 'break' && <Coffee size={11} aria-hidden="true" />}
                          <span>{peer.feedback}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="participants-row__media">
                    {canModerate && isPresenting && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={onStopHostScreenShare}
                      >
                        Stop sharing
                      </Button>
                    )}

                    {canModerate && reactionsEnabled && peer.handRaised && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onLowerHand?.(peer.peerId)}
                        aria-label={`Lower ${name}'s hand`}
                        className="participants-row__lower-hand-btn"
                      >
                        Lower hand
                      </Button>
                    )}

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

                    {canModerate && (!isCoHost || !peer.isHost) && (
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
                        {reactionsEnabled && peer.handRaised && (
                          <DropdownItem
                            icon={Hand}
                            onSelect={() => onLowerHand?.(peer.peerId)}
                          >
                            Lower hand
                          </DropdownItem>
                        )}
                        {isPresenting && (
                          <DropdownItem
                            icon={MonitorOff}
                            onSelect={onStopHostScreenShare}
                          >
                            Stop sharing
                          </DropdownItem>
                        )}
                        {peer.audio ? (
                          <DropdownItem
                            icon={MicOff}
                            onSelect={() => onMutePeer?.(peer.peerId)}
                          >
                            Mute
                          </DropdownItem>
                        ) : (
                          <DropdownItem
                            icon={Mic}
                            onSelect={() => onRequestUnmute?.(peer.peerId)}
                          >
                            Ask to unmute
                          </DropdownItem>
                        )}
                        {peer.video && (
                          <DropdownItem
                            icon={VideoOff}
                            onSelect={() => onStopPeerVideo?.(peer.peerId)}
                          >
                            Stop video
                          </DropdownItem>
                        )}
                        <DropdownItem
                          icon={Edit2}
                          onSelect={() => onRenamePeer?.(peer)}
                        >
                          Rename
                        </DropdownItem>
                        {isHost && (
                          peer.isCoHost ? (
                            <DropdownItem
                              icon={UserMinus}
                              onSelect={() => onDemoteCoHost?.(peer)}
                            >
                              Remove co-host
                            </DropdownItem>
                          ) : (
                            <DropdownItem
                              icon={UserCheck}
                              onSelect={() => onPromoteCoHost?.(peer)}
                            >
                              Make co-host
                            </DropdownItem>
                          )
                        )}
                        <DropdownItem
                          danger
                          icon={UserMinus}
                          onSelect={() => onRemove?.(peer, false)}
                        >
                          Remove
                        </DropdownItem>
                        <DropdownItem
                          danger
                          icon={Ban}
                          onSelect={() => onRemove?.(peer, true)}
                        >
                          Remove and block
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

      <footer className="participants-panel__footer">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (navigator?.clipboard) {
              navigator.clipboard.writeText(window.location.href);
            }
          }}
          aria-label="Invite others"
        >
          Invite
        </Button>
        {canModerate && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onMuteAll}
            aria-label="Mute all participants"
          >
            Mute All
          </Button>
        )}
      </footer>
    </aside>
  );
}
