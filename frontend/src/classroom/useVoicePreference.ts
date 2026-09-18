import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { VoiceStatus } from "../types/api";

export interface UseVoicePreferenceResult {
  /** true si conviene intentar voz neural para esta sesión: VOICE_PROVIDER
   * no es "browser" Y el backend reporta credencial de OpenAI TTS
   * disponible. "auto" y "openai" se resuelven igual acá — la diferencia
   * entre ambos (sección 21) es que "openai" ofrece fallback más
   * explícito ante una falla puntual, comportamiento que ya cubre
   * `voicePlayback.ts` vía `onNeuralError` en cualquiera de los dos casos. */
  useNeural: boolean;
  voiceStatus: VoiceStatus | null;
  loaded: boolean;
}

/** Determina, sin exponer nunca una API key al navegador, si esta sesión
 * debería preferir voz neural (Fase 7, sección 21). Un mismo fetch barato
 * y local (`GET /api/system/status`) por componente consumidor — se
 * prefirió esto a un contexto global compartido por simplicidad (no hay
 * llamadas a un LLM ni costo real involucrado en esta consulta). */
export function useVoicePreference(): UseVoicePreferenceResult {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getSystemStatus()
      .then((status) => {
        if (!cancelled) setVoiceStatus(status.voice);
      })
      .catch(() => {
        // Sin estado -> useNeural queda false (fallback seguro a browser).
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const useNeural = !!voiceStatus && voiceStatus.provider !== "browser" && voiceStatus.neural_configured;
  return { useNeural, voiceStatus, loaded };
}
