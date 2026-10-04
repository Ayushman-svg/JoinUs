import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listMeetings } from '../api/meetings.js';
import AppHeader from '../components/AppHeader.jsx';
import JoinByCode from '../components/JoinByCode.jsx';
import MeetingList from '../components/MeetingList.jsx';
import NewMeetingForm from '../components/NewMeetingForm.jsx';

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
];

const EMPTY_TEXT = {
  upcoming: 'No upcoming meetings. Start one or schedule one for later.',
  past: 'No past meetings yet.',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('upcoming');
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [list, setList] = useState({ status: 'loading', meetings: [], error: '' });

  useEffect(() => {
    const controller = new AbortController();
    setList((prev) => ({ ...prev, status: 'loading', error: '' }));

    listMeetings(tab, { signal: controller.signal })
      .then((meetings) => setList({ status: 'ready', meetings, error: '' }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setList({ status: 'error', meetings: [], error: err.message });
      });

    return () => controller.abort();
  }, [tab, reloadKey]);

  function changeTab(next) {
    setNotice('');
    setTab(next);
  }

  function onCreated(meeting) {
    if (!meeting.scheduledAt) {
      // Instant meeting: go straight to its page
      navigate(`/m/${meeting.code}`);
      return;
    }
    setNotice(`"${meeting.title}" is scheduled. Copy its invite link below to share it.`);
    setTab('upcoming');
    setReloadKey((key) => key + 1);
  }

  return (
    <div className="page">
      <AppHeader />
      <main className="content">
        <div className="dashboard">
          <div className="dashboard-side">
            <NewMeetingForm onCreated={onCreated} />
            <JoinByCode />
          </div>

          <section className="panel" aria-labelledby="meetings-title">
            <div className="panel-head">
              <h2 id="meetings-title" className="panel-title">
                My meetings
              </h2>
              <div className="segmented segmented-inline" role="group" aria-label="Meeting history">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={tab === t.id}
                    onClick={() => changeTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {notice && (
              <div className="notice" role="status">
                {notice}
              </div>
            )}

            {list.status === 'loading' && (
              <div className="list-state" role="status" aria-live="polite">
                <div className="spinner" aria-hidden="true" />
                <p className="muted">Loading meetings…</p>
              </div>
            )}

            {list.status === 'error' && (
              <div className="list-state">
                <p className="alert" role="alert">
                  {list.error}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  Try again
                </button>
              </div>
            )}

            {list.status === 'ready' &&
              (list.meetings.length === 0 ? (
                <p className="muted list-state">{EMPTY_TEXT[tab]}</p>
              ) : (
                <MeetingList meetings={list.meetings} filter={tab} />
              ))}
          </section>
        </div>
      </main>
    </div>
  );
}
