import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong' }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Render error:', error, info)
  }

  handleReload = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="full-center" style={{ minHeight: '100vh', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <div className="loading pulse" style={{ fontSize: 15 }}>caught a glitch.</div>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 12 }}>
              something broke on this page. the rest of the crew app is fine.
            </p>
            <button
              onClick={this.handleReload}
              className="btn btn-primary btn-md"
              style={{ marginTop: 20 }}
            >
              Back to HQ
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}