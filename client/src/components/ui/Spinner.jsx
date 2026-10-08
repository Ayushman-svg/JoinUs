// Decorative by default. Pass a label to announce it to screen readers.
export default function Spinner({ size = 'md', label }) {
  return (
    <span
      className={`ui-spinner ui-spinner--${size}`}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
