import { useEffect, useState } from "react";
import { api } from "../api/client";
import { isSpeechSupported } from "../classroom/speech";
import { getCourseLearningProgress, resetCourseProgress } from "../learning/learningProgressStore";
import type { CourseSummary, SystemStatusResponse } from "../types/api";

/** Pantalla "Configuración del sistema" (Fase 7, secciones 16/46).
 *
 * Deliberadamente de solo lectura: la configuración durable vive en
 * backend/.env, nunca se pega una API key acá — evita que un secreto
 * viaje innecesariamente al navegador. Nunca muestra API keys, prompts,
 * Grounding Packets, headers ni el path de filesystem completo del host. */
export function SettingsPage() {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [resetCourseId, setResetCourseId] = useState<string>("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSystemStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo conectar con el servidor.");
      });
    api
      .getCourses()
      .then((data) => {
        if (cancelled) return;
        setCourses(data);
        if (data.length > 0) setResetCourseId(data[0].id);
      })
      .catch(() => {
        // Informativo: si falla, simplemente no se ofrece el selector de curso.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleResetProgress() {
    if (!resetCourseId) return;
    const course = courses.find((c) => c.id === resetCourseId);
    const hasProgress = getCourseLearningProgress(resetCourseId) !== null;
    if (!hasProgress) {
      setResetMessage(`No hay progreso guardado para "${course?.title ?? resetCourseId}".`);
      return;
    }
    const confirmed = window.confirm(
      `¿Restablecer tu progreso de "${course?.title ?? resetCourseId}"? Se van a borrar el ` +
        "progreso de tópicos y el historial de prácticas/simulacros de este curso guardados " +
        "en este navegador. Esta acción no se puede deshacer."
    );
    if (!confirmed) return;
    resetCourseProgress(resetCourseId);
    setResetMessage(`Progreso de "${course?.title ?? resetCourseId}" restablecido.`);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header__eyebrow">Configuración</div>
        <h1>Configuración del sistema</h1>
        <p>
          Configuración local gestionada mediante <code>.env</code>. Ver{" "}
          <code>README.md</code> / <code>docs/CONFIGURATION.md</code> para instrucciones de
          setup.
        </p>
      </div>

      {error && (
        <div className="state-box state-box--error">
          <h3>No pudimos cargar el estado del sistema</h3>
          <p>{error}</p>
        </div>
      )}

      {!status && !error && (
        <div className="state-box">
          <h3>Cargando estado del sistema…</h3>
        </div>
      )}

      {status && (
        <div className="settings-grid">
          <section className="settings-card">
            <h3>Cursos</h3>
            <dl>
              <dt>Cursos detectados</dt>
              <dd>{status.courses.count}</dd>
              <dt>Diagnóstico general</dt>
              <dd>
                <span className={`settings-badge settings-badge--${status.courses.diagnostics}`}>
                  {status.courses.diagnostics}
                </span>
              </dd>
            </dl>
          </section>

          <section className="settings-card">
            <h3>IA</h3>
            <dl>
              <dt>Proveedor</dt>
              <dd>{status.llm.provider}</dd>
              <dt>Modelo</dt>
              <dd>{status.llm.model || "—"}</dd>
              <dt>Configurado</dt>
              <dd>
                <span
                  className={`settings-badge settings-badge--${status.llm.configured ? "ok" : "warning"}`}
                >
                  {status.llm.configured ? "sí" : "no"}
                </span>
              </dd>
              <dt>Versión de prompt (clases)</dt>
              <dd>{status.llm.prompt_version}</dd>
              <dt>Versión de prompt (certificación)</dt>
              <dd>{status.llm.certification_prompt_version}</dd>
            </dl>
          </section>

          <section className="settings-card">
            <h3>Voz</h3>
            <dl>
              <dt>Voz del navegador disponible</dt>
              <dd>{isSpeechSupported() ? "sí" : "no"}</dd>
              <dt>Modo configurado</dt>
              <dd>{status.voice.provider}</dd>
              <dt>Voz neural (OpenAI TTS) configurada</dt>
              <dd>
                <span
                  className={`settings-badge settings-badge--${status.voice.neural_configured ? "ok" : "warning"}`}
                >
                  {status.voice.neural_configured ? "sí" : "no — requiere OPENAI_API_KEY"}
                </span>
              </dd>
              <dt>Modelo TTS</dt>
              <dd>{status.voice.tts_model}</dd>
            </dl>
          </section>

          <section className="settings-card">
            <h3>Sistema</h3>
            <dl>
              <dt>Backend</dt>
              <dd>
                <span className="settings-badge settings-badge--ok">{status.backend}</span>
              </dd>
              <dt>Versión de la app</dt>
              <dd>{status.app_version}</dd>
              <dt>Cache local escribible</dt>
              <dd>{status.cache_writable ? "sí" : "no"}</dd>
            </dl>
          </section>
        </div>
      )}

      <section className="settings-card settings-card--wide">
        <h3>Datos de aprendizaje</h3>
        <p className="learning-disclaimer" style={{ margin: "0 0 14px" }}>
          El progreso y los resultados se guardan localmente en este navegador.
        </p>
        {courses.length === 0 ? (
          <p className="learning-empty-note">No hay cursos disponibles.</p>
        ) : (
          <div className="settings-reset">
            <label htmlFor="reset-course-select">Curso</label>
            <select
              id="reset-course-select"
              value={resetCourseId}
              onChange={(e) => {
                setResetCourseId(e.target.value);
                setResetMessage(null);
              }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button type="button" className="settings-reset__button" onClick={handleResetProgress}>
              Restablecer mi progreso
            </button>
          </div>
        )}
        {resetMessage && <p className="learning-empty-note">{resetMessage}</p>}
      </section>
    </div>
  );
}
