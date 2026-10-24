import React from "react";
import { InlineError } from "./InlineError";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Changing this value clears a caught error, e.g. the active tab id. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Render error:", error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      const isTr = typeof document !== "undefined" && document.documentElement.lang === "tr";
      return (
        <InlineError
          title={isTr ? "Bu ekran görüntülenemedi" : "Unable to display this view"}
          message={this.state.error.message || (isTr ? "Beklenmeyen bir hata oluştu." : "An unexpected error occurred.")}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
