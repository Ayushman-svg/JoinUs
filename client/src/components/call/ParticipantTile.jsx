import { MicOff } from 'lucide-react';

import Avatar from '../ui/Avatar.jsx';
import Spinner from '../ui/Spinner.jsx';
import VideoView from '../VideoView.jsx';

const WAITING_TEXT = {
  new: 'Connecting…',
  connecting: 'Connecting…',
  disconnected: 'Reconnecting…',
  failed: 'Reconnecting…',
};

// One person in the call. The picture is replaced by their initials when their camera is off,
// but the video element stays mounted, so their sound keeps playing.
//   audioOn / videoOn: their microphone and camera state (relayed by the server for others)
//   connectionState: only for remote people, to show that the link is still being set up
export default function ParticipantTile({ name, stream, local = false, audioOn, videoOn, connectionState }) {
  const waiting = !local ? WAITING_TEXT[connectionState] : null;
  const description = [name, !audioOn && 'microphone off', !videoOn && 'camera off'].filter(Boolean).join(', ');

  return (
    <div className="tile" role="group" aria-label={description}>
      <VideoView stream={stream} muted={local} mirrored={local} />

      {!videoOn && (
        <div className="tile__avatar">
          <Avatar name={name} size="xl" />
        </div>
      )}

      {waiting && (
        <div className="tile__status" role="status">
          <Spinner size="sm" />
          {waiting}
        </div>
      )}

      <div className="tile__label">
        {!audioOn && <MicOff size={14} aria-label="Microphone is off" />}
        <span>{name}</span>
      </div>
    </div>
  );
}
