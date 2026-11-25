import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Ocurrió un error inesperado en la aplicación.',
    };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed?.error) {
          friendly = `Error de permisos o conexión (${parsed.operationType} en ${parsed.path}): ${parsed.error}`;
        }
      } catch {
        // plain error message
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 p-6 space-y-4">
            <h1 className="font-display text-lg font-bold text-slate-900">
              Se detectó un problema al procesar la solicitud
            </h1>
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
