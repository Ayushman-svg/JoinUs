import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import Button from '../components/ui/Button.jsx';

export default function NotFoundPage() {
  return (
    <div className="ui-fullpage" role="status">
      <div className="ui-state">
        <span className="ui-state__icon">
          <Compass size={26} aria-hidden="true" />
        </span>
        <h1 className="ui-state__title">Page not found</h1>
        <p className="ui-state__text">
          The link you followed doesn't exist or may have been moved.
        </p>
        <div className="ui-state__actions">
          <Button as={Link} to="/" variant="primary">
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
