export function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// The same name always gets the same color
function colorIndex(name = '') {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 6;
}

// size: sm | md | lg | xl
export default function Avatar({ name = '', size = 'md', className = '' }) {
  return (
    <span
      className={`ui-avatar ui-avatar--${size} ui-avatar--c${colorIndex(name)} ${className}`.trim()}
      role="img"
      aria-label={name || 'Unknown user'}
    >
      {getInitials(name)}
    </span>
  );
}
