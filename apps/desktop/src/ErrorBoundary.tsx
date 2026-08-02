import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown above the message so the failing area is identifiable. */
  label?: string;
}

interface State {
  error?: Error;
  componentStack?: string;
}

/**
 * Keeps one failing area from blanking the whole window.
 *
 * React unmounts the entire tree when a render throws and nothing catches it,
 * which showed up as an empty black window with no way to tell what broke.
 * This reports the error in place and leaves the rest of the app usable.
 */
export default class ErrorBoundary extends Component<Props, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = info.componentStack;
    if (stack !== null && stack !== undefined) {
      this.setState({ componentStack: stack });
    }
    // Also surface it where a packaged build can still be inspected.
    console.error("Tpf2 Mod Studio: component failed", error, info);
  }

  override render(): ReactNode {
    const { error, componentStack } = this.state;
    if (error === undefined) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <strong>
          {this.props.label === undefined
            ? "This area could not be displayed."
            : `${this.props.label} could not be displayed.`}
        </strong>
        <p>{error.message}</p>
        <details>
          <summary>Technical details</summary>
          <pre>
            {error.stack ?? String(error)}
            {componentStack ?? ""}
          </pre>
        </details>
        <button
          className="secondary-button"
          onClick={() => this.setState({})}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }
}
