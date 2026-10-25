import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component } from 'react';

import Button from './ui/Button.jsx';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env?.DEV) {
      console.error('Unhandled React Error:', error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="ui-fullpage" role="alert">
          <div className="ui-state ui-state--error">
            <span className="ui-state__icon">
              <AlertTriangle size={26} aria-hidden="true" />
            </span>
            <h1 className="ui-state__title">Something went wrong</h1>
            <p className="ui-state__text">
              An unexpected error occurred while loading this page.
            </p>
            <div className="ui-state__actions">
              <Button
                variant="primary"
                leftIcon={RotateCcw}
                onClick={this.handleReload}
              >
                Reload
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
