import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-6 text-sm break-words">
            {this.state.error.message}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
