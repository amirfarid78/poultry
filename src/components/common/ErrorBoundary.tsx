// Top-level error boundary: catches render crashes anywhere in the app and
// shows a diagnosable fallback instead of a blank white screen.
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    // eslint-disable-next-line no-console
    console.error('[MurghMandi] render crash:', error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ error: null, componentStack: null });
    window.location.reload();
  };

  private handleResetData = () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      indexedDB.databases?.().then((dbs) => {
        dbs.forEach((d) => {
          if (d.name) indexedDB.deleteDatabase(d.name);
        });
      }).catch(() => {});
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 shadow-xl p-6 max-w-lg w-full">
          <h2 className="text-base font-bold text-red-700 mb-1">Something went wrong</h2>
          <p className="text-xs text-slate-500 mb-3">
            The app hit an unexpected error. Your data on the server is safe.
          </p>
          <pre className="text-[11px] bg-slate-900 text-red-300 rounded-xl p-3 overflow-auto max-h-40 mb-2">
            {error.name}: {error.message}
          </pre>
          {componentStack && (
            <details className="mb-4">
              <summary className="text-xs font-semibold text-slate-600 cursor-pointer">
                Technical details (for support)
              </summary>
              <pre className="text-[10px] bg-slate-50 text-slate-600 rounded-xl p-3 overflow-auto max-h-40 mt-1 whitespace-pre-wrap">
                {componentStack}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <button
              onClick={this.handleReload}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
            >
              Reload app
            </button>
            <button
              onClick={this.handleResetData}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-sm"
            >
              Clear local data & reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
