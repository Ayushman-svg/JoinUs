// TEMPORARY page for trying the call between two browsers. Replaced by the real call page.
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import AppHeader from '../components/AppHeader.jsx';
import VideoView from '../components/VideoView.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import { useMeetingMedia } from '../context/MeetingMediaContext.jsx';
import useCall from '../hooks/useCall.js';

function Tile({ stream, label, muted = false, mirrored = false }) {
  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 10', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
      <VideoView stream={stream} muted={muted} mirrored={mirrored} />
      <span style={{ position: 'absolute', left: 10, bottom: 10, color: '#fff', fontSize: 13 }}>{label}</span>
    </div>
  );
}

const STATUS_TEXT = {
  idle: 'Getting your camera ready…',
  connecting: 'Connecting to the meeting server… the first connection can take up to a minute.',
  joining: 'Joining the meeting…',
  active: 'You are in the meeting.',
  reconnecting: 'Connection lost. Reconnecting…',
  kicked: 'You joined this meeting from another tab, so this one was closed.',
  left: 'You left the meeting.',
  error: 'Could not join the meeting.',
};

export default function CallTest() {
  const { code } = useParams();
  const navigate = useNavigate();
  const media = useMeetingMedia();

  // Opening this page directly (without the join screen) starts the devices here
  const { status: mediaStatus, start: startMedia } = media;
  useEffect(() => {
    if (mediaStatus === 'idle') startMedia();
  }, [mediaStatus, startMedia]);

  // Joins once the devices are ready, or without them if they could not be started
  const call = useCall({
    code,
    localStream: media.stream,
    enabled: mediaStatus === 'ready' || mediaStatus === 'error',
  });

  const summary = {
    media: media.status,
    call: call.status,
    error: call.error?.code ?? null,
    selfId: call.selfId,
    peers: call.peers.map((peer) => ({
      peerId: peer.peerId,
      name: peer.user?.name,
      connectionState: peer.connectionState,
      hasStream: Boolean(peer.stream),
    })),
  };

  return (
    <div className="page">
      <AppHeader />
      <main className="content" style={{ display: 'grid', gap: 16 }}>
        <h1>Call test: {code}</h1>
        <p className="muted">{STATUS_TEXT[call.status]}</p>
        {media.error && <Alert variant="error">{media.error.message}</Alert>}
        {call.error && <Alert variant="error">{call.error.message}</Alert>}
        {call.status === 'active' && call.peers.length === 0 && <p className="muted">Waiting for others…</p>}

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <Tile stream={media.stream} label="You" muted mirrored />
          {call.peers.map((peer) => (
            <Tile key={peer.peerId} stream={peer.stream} label={peer.user?.name ?? 'Guest'} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={media.toggleAudio} disabled={!media.hasAudio}>
            {media.audioEnabled ? 'Mute' : 'Unmute'}
          </Button>
          <Button variant="secondary" onClick={media.toggleVideo} disabled={!media.hasVideo}>
            {media.videoEnabled ? 'Camera off' : 'Camera on'}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              // Release the camera and microphone, then go back to the dashboard
              media.stop();
              navigate('/');
            }}
          >
            Leave
          </Button>
        </div>
        <pre id="state" style={{ margin: 0, fontSize: 12 }}>
          {JSON.stringify(summary, null, 2)}
        </pre>
      </main>
    </div>
  );
}
