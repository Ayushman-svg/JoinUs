import { Link } from 'react-router-dom';

import { formatDateTime } from '../lib/datetime.js';
import CopyLinkButton from './CopyLinkButton.jsx';
import StatusBadge from './StatusBadge.jsx';

function badgeKind(meeting, filter) {
  if (meeting.status === 'cancelled') return 'cancelled';
  if (filter === 'past') return 'ended';
  return meeting.scheduledAt ? 'scheduled' : 'instant';
}

function whenText(meeting) {
  return meeting.scheduledAt
    ? formatDateTime(meeting.scheduledAt)
    : `Instant, ${formatDateTime(meeting.startsAt)}`;
}

export default function MeetingList({ meetings, filter }) {
  return (
    <ul className="meeting-list">
      {meetings.map((meeting) => (
        <li key={meeting.id} className="meeting-item">
          <div className="meeting-main">
            <Link to={`/m/${meeting.code}`} className="meeting-title">
              {meeting.title}
            </Link>
            <p className="muted meeting-meta">{whenText(meeting)}</p>
            <p className="meeting-code">{meeting.code}</p>
          </div>
          <div className="meeting-side">
            <StatusBadge kind={badgeKind(meeting, filter)} />
            {filter === 'upcoming' && <CopyLinkButton code={meeting.code} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
