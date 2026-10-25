export function getInitials(name = '') {
  const cleaned = name.replace(/\s*\([^)]*\)/g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const second = parts.length > 1 ? parts[1][0] : '';
  return (first + second).toUpperCase();
}
