const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(value) {
  return formatter.format(new Date(value));
}

const pad = (n) => String(n).padStart(2, '0');

// Value format required by <input type="datetime-local">, in local time
export function toLocalInputValue(date) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function nextFullHour() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

export function formatDuration(ms) {
  if (!ms || ms <= 0) return '0 min';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return '< 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
