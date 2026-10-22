import { Ban, Clock, PhoneOff, RefreshCw, UserMinus } from 'lucide-react';

import Button from '../ui/Button.jsx';

// Centered status cards for guest waiting, denied, removed, and ended states.
// Designed per the Project Context STYLING spec:
// max-width 440px, surface #151A21, border #2D3742, 16px radius, generous padding.
export default function CallStatusCard({ status, hostInRoom = true, onRetry, onLeave }) {
  let icon = null;
  let title = '';
  let description = '';
  let isWaiting = false;
  let actions = null;

  switch (status) {
    case 'waiting':
      isWaiting = true;
      icon = <Clock size={28} className="call-status-card__icon-pulse" aria-hidden="true" />;
      if (!hostInRoom) {
        title = 'Waiting for the host';
        description = 'Waiting for the host to start the meeting.';
      } else {
        title = 'Waiting to be admitted';
        description = 'The meeting host will let you in soon.';
      }
      actions = (
        <Button variant="secondary" onClick={onLeave}>
          Leave
        </Button>
      );
      break;

    case 'denied':
      icon = <Ban size={28} aria-hidden="true" />;
      title = "The host couldn't admit you";
      description = 'You can ask to join again or return to your dashboard.';
      actions = (
        <div className="call-status-card__actions-row">
          <Button variant="secondary" onClick={onLeave}>
            Back to dashboard
          </Button>
          {onRetry && (
            <Button variant="primary" leftIcon={RefreshCw} onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      );
      break;

    case 'removed':
      icon = <UserMinus size={28} aria-hidden="true" />;
      title = 'You were removed from the meeting';
      description = 'The host has removed you from this call.';
      actions = (
        <Button variant="primary" onClick={onLeave}>
          Back to dashboard
        </Button>
      );
      break;

    case 'ended':
      icon = <PhoneOff size={28} aria-hidden="true" />;
      title = 'This meeting has ended';
      description = 'The host has ended the meeting for everyone.';
      actions = (
        <Button variant="primary" onClick={onLeave}>
          Back to dashboard
        </Button>
      );
      break;

    default:
      return null;
  }

  return (
    <div className="call-status-card" role="status" aria-live="polite">
      <div className={`call-status-card__circle ${isWaiting ? 'call-status-card__circle--pulse' : ''}`}>
        {icon}
      </div>
      <h2 className="call-status-card__title">{title}</h2>
      <p className="call-status-card__description">{description}</p>
      <div className="call-status-card__actions">{actions}</div>
    </div>
  );
}
