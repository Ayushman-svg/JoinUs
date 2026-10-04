import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getMeeting } from '../api/meetings.js';
import AppHeader from '../components/AppHeader.jsx';
import CopyLinkButton from '../components/CopyLinkButton.jsx';
import FullPageLoader from '../components/FullPageLoader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatDateTime } from '../lib/datetime.js';
import { inviteLink } from '../lib/meetingLink.js';

export default function MeetingPage() {
  const { code } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ status: 'loading', meeting: null, error: '' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', meeting: null, error: '' });

    getMeeting(code, { signal: controller.signal })
      .then((meeting) => setState({ status: 'ready', meeting, error: '' }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.code === 'MEETING_NOT_FOUND') {
          setState({ status: 'notfound', meeting: null, error: '' });
        } else {
          setState({ status: 'error', meeting: null, error: err.message });
        }
      });

    return () => controller.abort();
  }, [code, reloadKey]);

  if (state.status === 'loading') return <FullPageLoader label="Loading meeting…" />;

  const { meeting } = state;
  const cancelled = meeting?.status === 'cancelled';

  return (
    <div className="page">
      <AppHeader />
      <main className="content">
        <Link to="/" className="back-link">
          Back to dashboard
        </Link>

        <section className="panel meeting-card">
          {state.status === 'notfound' && (
            <>
              <h1 className="panel-title">Meeting not found</h1>
              <p className="muted">
                There is no meeting with the code <strong>{code}</strong>. Check the code or ask the
                host for a new invite link.
              </p>
            </>
          )}

          {state.status === 'error' && (
            <>
              <h1 className="panel-title">Could not load the meeting</h1>
              <p className="alert" role="alert">
                {state.error}
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Try again
              </button>
            </>
          )}

          {state.status === 'ready' && (
            <>
              <div className="meeting-heading">
                <h1 className="meeting-name">{meeting.title}</h1>
                <StatusBadge
                  kind={cancelled ? 'cancelled' : meeting.scheduledAt ? 'scheduled' : 'instant'}
                />
              </div>
              <p className="muted">Hosted by {meeting.host.name}</p>
              <p className="meeting-when">
                {meeting.scheduledAt
                  ? `Scheduled for ${formatDateTime(meeting.scheduledAt)}`
                  : 'Instant meeting'}
              </p>

              {cancelled && (
                <div className="alert" role="alert">
                  The host cancelled this meeting.
                </div>
              )}

              <div className="join-block">
                <button type="button" className="btn btn-primary" disabled>
                  Join meeting
                </button>
                <p className="hint">
                  {cancelled ? 'This meeting can no longer be joined.' : 'Joining is not available yet.'}
                </p>
              </div>

              {!cancelled && (
                <div className="invite">
                  <h2 className="invite-title">Invite link</h2>
                  <div className="invite-row">
                    <code className="invite-link">{inviteLink(meeting.code)}</code>
                    <CopyLinkButton code={meeting.code} />
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
