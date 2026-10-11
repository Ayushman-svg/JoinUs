// TEMPORARY page for trying the call between two browsers. Replaced by the real call page.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import AppHeader from '../components/AppHeader.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import useCall from '../hooks/useCall.js';
import useLocalMedia from '../hooks/useLocalMedia.js';

function VideoTile({ stream, label, muted = false }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) {
      // Browsers can refuse to start sound before the page has been clicked
      video.play().then(
        () => setBlocked(false),
        (err) => err.name === 'NotAllowedError' && setBlocked(true)
      );
    }
  }, [stream]);

  return (
    <div style={{ position: 'relative' }}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{ width: '100%', aspectRatio: '16 / 10', background: '#000', borderRadius: 12, objectFit: 'cover' }}
      />
      <span style={{ position: 'absolute', left: 10, bottom: 10, color: '#fff', fontSize: 13 }}>{label}</span>
      {blocked && (
        <Button
          size="sm"
          style={{ position: 'absolute', top: 10, left: 10 }}
          onClick={() => ref.current.play().then(() => setBlocked(false))}
        >
          Tap to play
        </Button>
      )}
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
  const media = useLocalMedia();
  const call = useCall({ code, localStream: media.stream, enabled: media.status === 'ready' });

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
          <VideoTile stream={media.stream} label="You" muted />
          {call.peers.map((peer) => (
            <VideoTile key={peer.peerId} stream={peer.stream} label={peer.user?.name ?? 'Guest'} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={media.toggleAudio}>
            {media.audioEnabled ? 'Mute' : 'Unmute'}
          </Button>
          <Button variant="secondary" onClick={media.toggleVideo}>
            {media.videoEnabled ? 'Camera off' : 'Camera on'}
          </Button>
          <Button variant="danger" onClick={() => navigate(`/m/${code}`)}>
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
