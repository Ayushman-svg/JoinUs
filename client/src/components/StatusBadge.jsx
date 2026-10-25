import Badge from './ui/Badge.jsx';

const KINDS = {
  scheduled: { label: 'Scheduled', variant: 'primary' },
  instant: { label: 'Instant', variant: 'neutral' },
  ended: { label: 'Ended', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  not_started: { label: 'Not started', variant: 'neutral' },
  past: { label: 'Past', variant: 'neutral' },
};

export default function StatusBadge({ kind }) {
  const { label, variant } = KINDS[kind] || KINDS.instant;
  return <Badge variant={variant}>{label}</Badge>;
}
