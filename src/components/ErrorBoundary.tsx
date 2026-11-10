import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("GitPulse UI error", error, info);
  }

  render() {
    if (this.state.error) {
      const { name, message, stack } = this.state.error;
      return (
        <div
          style={{
            margin: 0,
            padding: 16,
            minHeight: "100vh",
            background: "#0b0d10",
            color: "#e6eaf2",
            fontFamily:
              'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>
            GitPulse hit a problem
          </h1>
          <p style={{ margin: "0 0 12px", color: "#8b94a7", fontSize: 13 }}>
            The interface could not be displayed. Details below can help diagnose the issue.
          </p>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 8,
              background: "#12151a",
              border: "1px solid #232936",
              color: "#f85149",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {name}: {message}
            {"\n"}
            {stack ?? ""}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
