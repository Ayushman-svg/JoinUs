import { Link } from 'react-router-dom';

import Button from '../ui/Button.jsx';
import ErrorState from '../ui/ErrorState.jsx';

// Friendly full-stage messages for the ways joining can end, each with a clear next step.
// code: the error code from the call session, or "KICKED" when another tab replaced this one.
export default function CallProblem({ code, onRetry, onLogin }) {
  const home = (
    <Button as={Link} to="/" variant="secondary">
      Back to dashboard
    </Button>
  );

  switch (code) {
    case 'ROOM_FULL':
      return (
        <ErrorState
          title="This meeting is full"
          description="There is no room for another person right now. Try again in a moment, or ask the host."
          onRetry={onRetry}
          action={home}
        />
      );
    case 'WAITING_FULL':
      return (
        <ErrorState
          title="The waiting room is full"
          description="Too many guests are waiting for this meeting right now. Try again in a moment."
          onRetry={onRetry}
          action={home}
        />
      );
    case 'MEETING_ENDED':
      return (
        <ErrorState
          title="This meeting has ended"
          description="The host has ended the meeting for everyone."
          action={home}
        />
      );
    case 'MEETING_CANCELLED':
      return (
        <ErrorState
          title="This meeting was cancelled"
          description="The host cancelled it, so it can't be joined."
          action={home}
        />
      );
    case 'MEETING_NOT_FOUND':
      return (
        <ErrorState
          title="We couldn't find that meeting"
          description="Check the link, or ask the host for a new invite."
          action={home}
        />
      );
    case 'BLOCKED':
      return (
        <ErrorState
          title="You cannot join this meeting"
          description="The host has blocked you from joining this meeting."
          action={home}
        />
      );
    case 'MEETING_LOCKED':
      return (
        <ErrorState
          title="This meeting is locked"
          description="The host has locked this meeting. No new participants can join."
          onRetry={onRetry}
          action={home}
        />
      );
    case 'RATE_LIMITED':
      return (
        <ErrorState
          title="Too many attempts"
          description="Too many incorrect passcode attempts. Please wait 10 minutes before trying again."
          onRetry={onRetry}
          action={home}
        />
      );
    case 'PASSCODE_REQUIRED':
    case 'PASSCODE_INVALID':
      return (
        <ErrorState
          title="Passcode required"
          description={code === 'PASSCODE_INVALID' ? "The passcode entered was incorrect." : "This meeting requires a valid passcode to join."}
          onRetry={onRetry}
          retryLabel="Enter passcode"
          action={home}
        />
      );
    case 'KICKED':
      return (
        <ErrorState
          title="You joined from another tab"
          description="This meeting is open in another tab or window, so this one was closed."
          onRetry={onRetry}
          retryLabel="Join here instead"
          action={home}
        />
      );
    case 'UNAUTHORIZED':
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return (
        <ErrorState
          title="Please log in again"
          description="Your session has ended. Log in to rejoin the meeting."
          action={
            <Button variant="primary" onClick={onLogin}>
              Log in
            </Button>
          }
        />
      );
    default:
      return (
        <ErrorState
          title="We couldn't join the meeting"
          description="Check your connection and try again."
          onRetry={onRetry}
          action={home}
        />
      );
  }
}
