// Hook de lectura del Learning Profile server-side (v1.7.0, Bloque 5).
// Ver docs/SERVER_SIDE_PROFILE_V1_7.md sección "Bloque 5".
//
// PRINCIPIO CENTRAL DEL CUTOVER: este módulo es, desde este bloque, la
// ÚNICA vía productiva por la que la UI obtiene `LearningState[]`/
// `LearningStateSummary` reales -- nunca vuelve a llamar a
// `deriveCourseLearningStates`/`summarizeLearningStates`
// (`learningState.ts`) para decidir el estado pedagógico ACTUAL de un
// alumno. Esas funciones (y `topicLearningSignal.ts`) siguen existiendo
// sin cambios como oráculo histórico de paridad (tests, ver
// `fixtures/learning_state_parity.json`) y como tipos reutilizados acá
// (`LearningState`/`LearningStateSummary`/`TopicLearningSignal`) -- pero
// ESTE archivo nunca las invoca para clasificar evidencia: solo adapta
// shape/naming de lo que el backend ya derivó (PASO 10/11 de la
// especificación).
//
// Mismas reglas de diseño que useServerTopicProgress.ts/
// useServerCertificationHistory.ts (Bloques 2/3):
// - `profile === null` SIEMPRE significa "todavía cargando" (nunca "perfil
//   vacío") -- PASO 22: un placeholder semántico (summary en 0, todo
//   not_started) sería un dato FALSO mientras carga.
// - Un error (503/red/bootstrap legacy fallido) nunca sobrescribe el
//   último perfil ya mostrado con un estado vacío, y NUNCA se convierte
//   en "todo not_started" (PASO 23/69) -- `error=true` se expone aparte
//   para que la página decida cómo comunicarlo.
// - Bootstrap ANTES de leer el perfil (PARTE C): el legacy import de topic
//   progress Y de Certification history debe terminar antes del
//   `GET .../learning-profile` (PASO 14-17) -- reutiliza EXACTAMENTE
//   `fetchCourseTopicProgress`/`fetchCourseCertificationHistory` (Bloques
//   2/3), nunca reimplementa el algoritmo de import. Si cualquiera de los
//   dos falla, el bootstrap completo se considera fallido (PASO 17): NUNCA
//   se continúa silenciosamente a pedir el perfil como si la migración
//   hubiera terminado.
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { fetchCourseCertificationHistory } from "./useServerCertificationHistory";
import { fetchCourseTopicProgress } from "./useServerTopicProgress";
import type { LearningState, LearningStateSummary } from "./learningState";
import type { TopicLearningSignal } from "./topicLearningSignal";
import type { LearningProfileResponse, LearningProfileTopicEntry } from "../types/api";

export interface ServerLearningProfile {
  courseId: string;
  summary: LearningStateSummary;
  states: LearningState[];
}

export interface ServerLearningProfileState {
  /** null mientras carga (o si `courseId` es null); una vez cargado, el
   * perfil completo (posiblemente "todo not_started", pero nunca un
   * placeholder -- PASO 22). */
  profile: ServerLearningProfile | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

/** Adapter PURO (PASO 10): solo transforma shape/naming de lo que el
 * backend ya clasificó -- nunca aplica thresholds, nunca decide reason
 * code, nunca recalcula la ventana de observaciones. Los campos de
 * `TopicLearningSignal` que el contrato público de Learning Profile no
 * expone todavía (`latestScore`/`reinforcementLevel`/`lastObservedAt`) se
 * completan en `null`: ningún consumidor de producción los lee hoy (solo
 * `describeLearningStateEvidence` toca `.evidence`, y únicamente usa
 * `.observations`/`.recentAverage` -- ver auditoría de consumidores del
 * Bloque 5) -- es una ausencia declarada, nunca un valor inventado. */
function toLearningState(entry: LearningProfileTopicEntry, courseId: string): LearningState {
  const evidence: TopicLearningSignal = {
    moduleId: entry.module_id,
    topicId: entry.topic_id,
    status: entry.curricular_status,
    observations: entry.observation_count,
    latestScore: null,
    recentAverage: entry.recent_average,
    reinforcementLevel: null,
    lastObservedAt: null,
  };
  return {
    courseId,
    moduleId: entry.module_id,
    topicId: entry.topic_id,
    status: entry.learning_status,
    reasonCode: entry.reason_code,
    evidence,
  };
}

function toLearningStateSummary(courseId: string, response: LearningProfileResponse): LearningStateSummary {
  const { summary } = response;
  return {
    courseId,
    totalTopics: summary.total_topics,
    notStarted: summary.not_started,
    progressing: summary.progressing,
    needsReview: summary.needs_review,
    mastered: summary.mastered,
    // Presentacional (nunca leído por ningún consumidor de producción hoy,
    // ver auditoría del Bloque 5) -- mismo redondeo simple que ya usa
    // `summarizeLearningStates` para el mismo cálculo, sobre counts que el
    // backend YA clasificó (no es una reclasificación).
    masteredPercentage: summary.total_topics > 0 ? Math.round((summary.mastered / summary.total_topics) * 100) : 0,
  };
}

/** Bootstrap-then-fetch (PASO 14-16): función de alto nivel reutilizable
 * tanto por el hook de abajo como por cualquier llamador puntual (ej.
 * `LearningProgressPage.tsx::handleStartVerification`, que necesita el
 * perfil de un curso que puede no ser el `courseId` montado en esta
 * página -- mismo motivo por el que existen
 * `fetchCourseTopicProgress`/`fetchCourseCertificationHistory`). Nunca
 * duplica el algoritmo de import: reutiliza esas dos funciones tal cual. */
export async function fetchCourseLearningProfile(
  courseId: string,
  signal?: AbortSignal
): Promise<ServerLearningProfile> {
  // PASO 16: ambos bootstraps en paralelo (independientes entre sí), pero
  // el perfil solo se pide después de que AMBOS terminaron -- si
  // cualquiera rechaza, este `await` propaga el error y el `GET
  // .../learning-profile` nunca se dispara (PASO 17: nunca continuar
  // silenciosamente como si la migración hubiera terminado).
  await Promise.all([fetchCourseTopicProgress(courseId, signal), fetchCourseCertificationHistory(courseId, signal)]);

  const response = await api.getLearningProfile(courseId, signal);
  return {
    courseId,
    summary: toLearningStateSummary(courseId, response),
    states: response.topics.map((entry) => toLearningState(entry, courseId)),
  };
}

export function useServerLearningProfile(courseId: string | null): ServerLearningProfileState {
  const [profile, setProfile] = useState<ServerLearningProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!courseId) {
      setProfile(null);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    async function load(id: string) {
      try {
        const next = await fetchCourseLearningProfile(id, controller.signal);
        if (!cancelled) {
          setProfile(next);
          setLoading(false);
        }
      } catch {
        if (cancelled) return;
        // PASO 23/69: nunca se pisa `profile` con un estado vacío ante un
        // error -- se preserva el último perfil conocido (o null si nunca
        // cargó ninguno todavía).
        setError(true);
        setLoading(false);
      }
    }

    void load(courseId);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [courseId, reloadToken]);

  return { profile, loading, error, refetch };
}
