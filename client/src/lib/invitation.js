/**
 * Formats standard invitation text for sharing and clipboard copying.
 */
export function formatInvitationText({
  title,
  scheduledAt,
  timeZone,
  duration,
  code,
  passcode,
  baseUrl,
}) {
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://joinus-flame.vercel.app');
  const meetingUrl = `${origin.replace(/\/+$/, '')}/m/${code}`;

  const dateObj = scheduledAt ? new Date(scheduledAt) : null;
  let timeStr = 'Instant Meeting';
  if (dateObj && !Number.isNaN(dateObj.getTime())) {
    try {
      timeStr = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: timeZone || undefined,
      }).format(dateObj);
      if (timeZone) {
        timeStr += ` (${timeZone})`;
      }
    } catch {
      timeStr = dateObj.toLocaleString();
    }
  }

  const lines = [
    "You're invited to a JoinUs video meeting.",
    '',
    `Topic: ${title || 'JoinUs Meeting'}`,
    `Time: ${timeStr}`,
  ];

  if (duration) {
    lines.push(`Duration: ${duration} minutes`);
  }

  lines.push('');
  lines.push('Join Meeting:');
  lines.push(meetingUrl);
  lines.push('');
  lines.push(`Meeting Code: ${code}`);

  if (passcode) {
    lines.push(`Passcode: ${passcode}`);
  }

  return lines.join('\n');
}

/**
 * Builds a direct Google Calendar event creation URL.
 */
export function getGoogleCalendarUrl({
  title,
  description,
  scheduledAt,
  duration,
  code,
  baseUrl,
}) {
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://joinus-flame.vercel.app');
  const meetingUrl = `${origin.replace(/\/+$/, '')}/m/${code}`;
  const start = scheduledAt ? new Date(scheduledAt) : new Date();
  const durMin = Number(duration) || 30;
  const end = new Date(start.getTime() + durMin * 60 * 1000);

  const formatGCalDate = (d) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const datesParam = `${formatGCalDate(start)}/${formatGCalDate(end)}`;
  const detailsParts = [];
  if (description) {
    detailsParts.push(description);
  }
  detailsParts.push(`Join Meeting: ${meetingUrl}`);
  detailsParts.push(`Meeting Code: ${code}`);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'JoinUs Meeting',
    dates: datesParam,
    details: detailsParts.join('\n\n'),
    location: meetingUrl,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
