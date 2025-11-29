import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    backgroundColor: '#000',
                    color: '#fff',
                    fontFamily: 'monospace',
                    padding: '20px',
                    textAlign: 'center'
                }}>
                    <h1 style={{ color: '#ef2929' }}>SYSTEM_CRITICAL_ERROR</h1>
                    <p>An unexpected error occurred in the neural matrix.</p>
                    <pre style={{
                        background: '#1a1a1a',
                        padding: '15px',
                        borderRadius: '5px',
                        color: '#ef2929',
                        maxWidth: '800px',
                        overflow: 'auto',
                        marginTop: '20px'
                    }}>
                        {this.state.error?.toString()}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '30px',
                            padding: '10px 20px',
                            background: 'transparent',
                            border: '1px solid #00ff00',
                            color: '#00ff00',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            fontSize: '16px'
                        }}
                    >
                        [ REBOOT_SYSTEM ]
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
