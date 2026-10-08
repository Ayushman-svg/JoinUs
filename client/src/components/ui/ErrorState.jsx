import { RefreshCw, TriangleAlert } from 'lucide-react';

import Button from './Button.jsx';

// Friendly error screen: plain language, a way forward, never a raw error code.
export default function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again in a moment.',
  onRetry,
  retryLabel = 'Try again',
  action,
}) {
  return (
    <div className="ui-state ui-state--error" role="alert">
      <span className="ui-state__icon">
        <TriangleAlert size={26} aria-hidden="true" />
      </span>
      <h3 className="ui-state__title">{title}</h3>
      <p className="ui-state__text">{description}</p>
      {(onRetry || action) && (
        <div className="ui-state__actions">
          {onRetry && (
            <Button variant="primary" leftIcon={RefreshCw} onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
