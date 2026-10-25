import Spinner from './ui/Spinner.jsx';
import useSlowRequest from '../hooks/useSlowRequest.js';

export default function FullPageLoader({ label = 'Loading…' }) {
  const isSlow = useSlowRequest(true, 4000);

  return (
    <div className="ui-fullpage" role="status" aria-live="polite">
      <Spinner size="lg" />
      <p style={{ fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)' }}>{label}</p>
      {isSlow && (
        <p style={{ maxWidth: '24rem', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', padding: '0 var(--space-4)' }}>
          Waking up the server, this can take up to a minute on the free plan
        </p>
      )}
    </div>
  );
}

