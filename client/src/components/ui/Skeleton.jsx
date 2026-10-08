// Placeholder block shown while content loads. Size it with width/height.
export default function Skeleton({ width = '100%', height = '1rem', circle = false, className = '' }) {
  return (
    <span
      className={`ui-skeleton ${circle ? 'ui-skeleton--circle' : ''} ${className}`.trim()}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
