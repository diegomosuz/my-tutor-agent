import { Link } from "react-router-dom";

/** Pantalla 404 del frontend (Fase 7, sección 20): nunca dejar una página
 * vacía ante una ruta no encontrada. */
export function NotFoundPage() {
  return (
    <div className="page">
      <div className="state-box">
        <h3>Página no encontrada</h3>
        <p>La dirección a la que intentaste acceder no existe.</p>
        <Link to="/" className="course-card__cta" style={{ marginTop: 12, display: "inline-flex" }}>
          Volver al catálogo →
        </Link>
      </div>
    </div>
  );
}
