// Hook de lectura de progreso curricular server-side (v1.7.0, Bloque 2).
// Ver docs/SERVER_SIDE_PROFILE_V1_7.md seccion "Bloque 2".
//
// Reglas de diseno:
// - `topics === null` SIEMPRE significa "todavia cargando" (PASO 27:
//   nunca se interpreta como "sin progreso" -- una vez que carga, un
//   curso sin actividad real es `{}`, un objeto vacio pero no-null).
// - Un error de red (PASO 28) nunca sobrescribe el progreso ya mostrado
//   con un estado vacio: `error=true` se expone aparte para que la
//   pagina consumidora decida como comunicarlo, y `topics` conserva su
//   ultimo valor conocido (o sigue null si nunca cargo).
// - El import legacy -> servidor (PASO 32/33) corre UNA sola vez por
//   curso por navegador (marcador cliente, ver learningProgressStore.ts),
//   nunca en cada carga.
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import {
  getLegacyTopicsSnapshot,
  hasImportedServerProgress,
  markServerProgressImported,
} from "./learningProgressStore";
import type { TopicLearningProgress, TopicStatus } from "./types";
import type { CourseProgressResponse, TopicProgressEntry } from "../types/api";

export interface ServerTopicProgressState {
  /** null mientras carga; una vez cargado, un mapa (posiblemente vacio)
   * `${moduleId}:${topicId}` -> TopicLearningProgress. */
  topics: Record<string, TopicLearningProgress> | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

function topicKey(moduleId: string, topicId: string): string {
  return `${moduleId}:${topicId}`;
}

function toLearningProgress(entry: TopicProgressEntry): TopicLearningProgress {
  const fallbackAccess = entry.completed_at ?? entry.started_at ?? new Date(0).toISOString();
  return {
    moduleId: entry.module_id,
    topicId: entry.topic_id,
    status: entry.status as TopicStatus,
    startedAt: entry.started_at,
    lastAccessedAt: fallbackAccess,
    completedAt: entry.completed_at,
    // v1.7.0 Bloque 2: la posicion de escena/hash de contenido siguen
    // siendo puramente device-local (classroomStorage.ts, Fase 4) -- nunca
    // se centralizan server-side, ver docs/SERVER_SIDE_PROFILE_V1_7.md.
    currentScene: null,
    totalScenes: null,
    contentSha256: null,
  };
}

function toRecord(response: CourseProgressResponse): Record<string, TopicLearningProgress> {
  const record: Record<string, TopicLearningProgress> = {};
  for (const entry of response.topics) {
    record[topicKey(entry.module_id, entry.topic_id)] = toLearningProgress(entry);
  }
  return record;
}

/** Get-or-import: la misma lógica que usa el hook, extraída para que
 * cualquier llamador puntual (ej. `LearningProgressPage.tsx::
 * handleStartVerification`, que resuelve progreso de un curso que puede
 * no ser `selectedCourseId` y por lo tanto nunca pasó por el hook) también
 * dispare el bootstrap legacy -- bug real encontrado en QA: sin esto, un
 * curso cuyo hook nunca se montó para ESE courseId nunca importaba su
 * progreso legacy, y una llamada directa a la API solo veía lo que ya
 * hubiera en el servidor (potencialmente nada). Idempotente por el mismo
 * marcador cliente que ya usa el hook -- llamar esto y luego montar el
 * hook (o viceversa) para el mismo curso nunca reimporta dos veces. */
export async function fetchCourseTopicProgress(
  courseId: string,
  signal?: AbortSignal
): Promise<Record<string, TopicLearningProgress>> {
  let response = await api.getCourseProgress(courseId, signal);

  if (!hasImportedServerProgress(courseId)) {
    const legacy = getLegacyTopicsSnapshot(courseId);
    if (legacy.length > 0) {
      response = await api.importLegacyProgress(
        courseId,
        {
          topics: legacy.map((t) => ({
            module_id: t.moduleId,
            topic_id: t.topicId,
            status: t.status as "in_progress" | "completed",
            started_at: t.startedAt,
            completed_at: t.completedAt,
          })),
        },
        signal
      );
    }
    markServerProgressImported(courseId);
  }

  return toRecord(response);
}

export function useServerTopicProgress(courseId: string | null): ServerTopicProgressState {
  const [topics, setTopics] = useState<Record<string, TopicLearningProgress> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!courseId) {
      setTopics(null);
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
        const record = await fetchCourseTopicProgress(id, controller.signal);
        if (!cancelled) {
          setTopics(record);
          setLoading(false);
        }
      } catch {
        if (cancelled) return;
        // PASO 28: nunca se pisa `topics` con un estado vacio ante un
        // error -- se preserva lo ultimo conocido (o null si nunca cargo).
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

  return { topics, loading, error, refetch };
}
