import Spinner from './ui/Spinner.jsx';

export default function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="ui-fullpage" role="status" aria-live="polite">
      <Spinner size="lg" />
      <p>{label}</p>
    </div>
  );
}
