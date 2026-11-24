import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed && parsed.error) {
        readable = `Access or database error${parsed.path ? ` (${parsed.path})` : ''}: ${parsed.error}`;
      }
    } catch {
      // keep standard message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
          <div className="w-full max-w-md rounded-2xl border border-border-theme bg-surface p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-display text-lg font-bold text-heading">
              Something interrupted your session
            </h2>
            <p className="mt-2 text-sm text-muted break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-btn-primary-hover transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Reload Platform
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
