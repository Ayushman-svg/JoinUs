/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string.
 */

function escapeIcsText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

function formatIcsDate(date) {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function generateIcs(meeting, { baseUrl = 'http://localhost:5173' } = {}) {
  const code = meeting.code;
  const title = meeting.title || 'JoinUs Meeting';
  const description = meeting.description || '';
  const startTime = meeting.scheduledAt
    ? new Date(meeting.scheduledAt)
    : new Date(meeting.startsAt || Date.now());
  const durationMinutes = Number(meeting.duration) || 30;
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const meetingUrl = `${baseUrl.replace(/\/+$/, '')}/m/${code}`;

  const descParts = [];
  if (description) {
    descParts.push(description);
  }
  descParts.push(`Join Meeting: ${meetingUrl}`);
  descParts.push(`Meeting Code: ${code}`);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JoinUs//Video Meetings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${code}@joinus`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startTime)}`,
    `DTEND:${formatIcsDate(endTime)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`,
    `LOCATION:${escapeIcsText(meetingUrl)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n') + '\r\n';
}

module.exports = { generateIcs, escapeIcsText, formatIcsDate };
