import React, { Component } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import Button from './Button.jsx';

/**
 * FeatureBoundary: Error boundary for features and panels.
 * Catches render errors and displays a small 'This feature is unavailable'
 * card with a Retry button instead of crashing into a white screen.
 */
export default class FeatureBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[FeatureBoundary caught error]:', error, errorInfo);
    }
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ retry: this.handleRetry })
          : this.props.fallback;
      }

      return (
        <div className="feature-boundary-card" role="alert">
          <span className="feature-boundary-card__icon" aria-hidden="true">
            <TriangleAlert size={20} />
          </span>
          <p className="feature-boundary-card__title">
            {this.props.title || 'This feature is unavailable'}
          </p>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={RefreshCw}
            onClick={this.handleRetry}
            className="feature-boundary-card__retry"
          >
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
