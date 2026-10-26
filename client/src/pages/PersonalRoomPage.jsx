import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Video, Clock, RefreshCw, ArrowLeft, AlertCircle, Users } from 'lucide-react';

import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Alert from '../components/ui/Alert.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { getPersonalRoom } from '../api/meetings.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function PersonalRoomPage({
  initialLoading,
  initialRoomData = null,
  initialError = '',
} = {}) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth() || {};

  const [loading, setLoading] = useState(
    initialLoading !== undefined ? initialLoading : (initialRoomData || initialError ? false : true)
  );
  const [error, setError] = useState(initialError);
  const [roomData, setRoomData] = useState(initialRoomData);

  const fetchRoomStatus = () => {
    setLoading(true);
    setError('');
    getPersonalRoom(slug)
      .then((data) => {
        setRoomData(data);
        // If the viewer is the host, automatically enter the meeting room
        if (data.isHost && data.code) {
          navigate(`/m/${data.code}`);
        }
      })
      .catch((err) => {
        if (err.status === 404 || err.code === 'ROOM_NOT_FOUND') {
          setError('Personal meeting room not found');
        } else {
          setError(err.message || 'Failed to check personal room status');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (initialRoomData || initialError) return;
    fetchRoomStatus();
  }, [slug]);

  if (loading) {
    return (
      <div className="personal-room-page">
        <div className="personal-room-card">
          <div className="personal-room-spinner" aria-hidden="true" />
          <p className="personal-room-loading-text">
            Connecting to personal meeting room…
          </p>
        </div>
      </div>
    );
  }

  if (error || !roomData) {
    return (
      <div className="personal-room-page">
        <div className="personal-room-card">
          <div className="personal-room-error-icon" aria-hidden="true">
            <AlertCircle size={40} />
          </div>
          <h1 className="personal-room-title">Room Not Found</h1>
          <p className="personal-room-subtitle">
            The personal meeting room <code>/room/{slug}</code> could not be found. Please verify the link.
          </p>
          <div className="personal-room-actions">
            <Link to="/" className="btn btn--secondary btn--md">
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { active, code, host } = roomData;

  // Active meeting state for guest
  if (active && code) {
    return (
      <div className="personal-room-page">
        <div className="personal-room-card">
          <div className="personal-room-icon-box" aria-hidden="true">
            <Video size={36} />
          </div>
          <h1 className="personal-room-title">{host?.name}&apos;s Personal Room</h1>
          <div className="personal-room-badge-row">
            <StatusBadge kind="live" />
          </div>
          <p className="personal-room-subtitle">
            The host is in the meeting room. You can join the session now.
          </p>

          <div className="personal-room-actions">
            <Button
              type="button"
              variant="primary"
              size="lg"
              leftIcon={Video}
              onClick={() => navigate(`/m/${code}`)}
              className="personal-room-btn"
            >
              Join Meeting
            </Button>
            <Link to="/" className="btn btn--ghost btn--sm">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Inactive / host hasn't started state
  return (
    <div className="personal-room-page">
      <div className="personal-room-card">
        <div className="personal-room-waiting-icon" aria-hidden="true">
          <Clock size={36} />
        </div>
        <h1 className="personal-room-title">{host?.name}&apos;s Personal Room</h1>
        <p className="personal-room-notice" role="status">
          The host has not started the room yet
        </p>
        <p className="personal-room-subtitle">
          Please wait or check back in a few moments. When {host?.name} opens their room, the session will begin.
        </p>

        <div className="personal-room-actions">
          <Button
            type="button"
            variant="secondary"
            size="md"
            leftIcon={RefreshCw}
            onClick={fetchRoomStatus}
            className="personal-room-btn"
          >
            Refresh Status
          </Button>
          <Link to="/" className="btn btn--ghost btn--sm">
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
