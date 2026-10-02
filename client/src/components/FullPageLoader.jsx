export default function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="center-screen" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="muted">{label}</p>
    </div>
  );
}
