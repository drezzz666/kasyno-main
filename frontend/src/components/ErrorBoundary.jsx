import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportClientError } from "../lib/reporter";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    reportClientError({
      error,
      errorType: "REACT_RENDER_ERROR",
      message: error?.message || "Błąd renderowania komponentu React",
      stack: error?.stack || "",
      componentStack: errorInfo?.componentStack || "",
      context: "React Error Boundary",
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl text-center backdrop-blur-xl">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/10">
              <AlertTriangle size={28} />
            </div>

            <h2 className="text-xl font-bold text-white mb-2 tracking-tight">
              Wystąpił nieoczekiwany problem
            </h2>

            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Przepraszamy! Interfejs gry napotkał błąd. Szczegółowy raport został już automatycznie przekazany do administratora.
            </p>

            <button
              onClick={this.handleReload}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
            >
              <RefreshCw size={16} />
              Odśwież i wróć do gry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
