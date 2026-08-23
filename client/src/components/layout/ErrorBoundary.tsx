import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  /**
   * `override` is required now that `noImplicitOverride` is on, and it is not ceremony.
   *
   * Without it, a lifecycle method renamed by a React major — or simply mistyped as
   * `componentDidCatchError` — compiles cleanly and silently stops being called, which for an error
   * boundary means every crash becomes a blank screen with nothing in the log.
   */
  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-lg font-semibold text-danger-text">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 text-sm rounded-lg bg-tint-accent text-accent-text hover:bg-tint-accent-strong transition-colors cursor-pointer border-none"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
