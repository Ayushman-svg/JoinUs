const KINDS = {
  scheduled: { label: 'Scheduled', className: 'badge-scheduled' },
  instant: { label: 'Instant', className: 'badge-neutral' },
  ended: { label: 'Ended', className: 'badge-neutral' },
  cancelled: { label: 'Cancelled', className: 'badge-danger' },
};

export default function StatusBadge({ kind }) {
  const { label, className } = KINDS[kind] || KINDS.instant;
  return <span className={`badge ${className}`}>{label}</span>;
}
