import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { Button } from "@shared/components/ui/button";
import { formatError, logError } from "@shared/utils/logger";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  errorMessage: string | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      errorMessage: formatError(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void logError("React render failed", `${formatError(error)} ${info.componentStack ?? ""}`);
  }

  render() {
    if (this.state.errorMessage) {
      return <AppErrorFallback message={this.state.errorMessage} />;
    }

    return this.props.children;
  }
}

function AppErrorFallback({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="grid max-w-lg gap-4 rounded-2xl border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Eko could not start</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The app hit a startup error. The details were logged.
          </p>
        </div>
        <pre className="max-h-44 overflow-auto rounded-xl bg-muted p-3 text-xs whitespace-pre-wrap">
          {message}
        </pre>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  );
}
