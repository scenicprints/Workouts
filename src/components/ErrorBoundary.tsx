import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * A page that throws shows what went wrong instead of a blank screen, with a way back Home. The
 * message is what to report when a page keeps failing. Mounted with the route as its key, so
 * moving to another page starts clean.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="stack">
        <div className="card">
          <div className="card__title">This page hit an error</div>
          <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error.message || String(error)}
          </p>
          <p className="muted small" style={{ margin: '8px 0 0' }}>Your data is untouched. If it keeps happening, send this message along with what you tapped.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <a href="#/" className="btn btn--primary">
              Home
            </a>
            <button type="button" className="btn btn--ghost" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
