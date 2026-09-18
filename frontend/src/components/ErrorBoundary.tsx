import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** ErrorBoundary React simple en la raíz de la app (Fase 7, sección 19).
 * Ante un error inesperado en el árbol de componentes, muestra un mensaje
 * genérico y una acción para volver al catálogo — nunca un stack trace en
 * la UI productiva (en development se loguea a console, nunca a un
 * servicio externo tipo Sentry). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("ErrorBoundary capturó un error inesperado:", error, info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false });
    window.location.assign("/");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__card">
            <h1>Algo salió mal</h1>
            <p>
              Ocurrió un error inesperado en la aplicación. Podés volver al catálogo e intentar de
              nuevo.
            </p>
            <button type="button" className="course-card__cta" onClick={this.handleReset}>
              Volver al catálogo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
