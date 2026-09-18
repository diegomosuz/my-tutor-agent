// Orquestación de Web Speech API sobre la narración de la escena activa
// (Fase 4). Deliberadamente separado de useClassroomEngine: el engine solo
// expone los puntos de integración que la voz necesita (escena actual,
// currentNarrationIndex, nextNarrationChunk) sin saber nada de síntesis de
// voz — así una fase futura con TTS avanzado puede reemplazar este hook
// sin tocar el engine.
import { useEffect, useRef } from "react";
import type { LessonScene } from "../types/api";
import {
  cancelSpeech,
  getAvailableVoices,
  isSpeechSupported,
  pauseSpeech,
  pickSpanishVoice,
  resumeSpeech,
  speakText,
} from "./speech";

export interface UseClassroomVoiceParams {
  scene: LessonScene | null;
  narrationIndex: number;
  renderKey: number;
  enabled: boolean;
  rate: number;
  isPaused: boolean;
  onAdvanceChunk: () => void;
}

export function useClassroomVoice({
  scene,
  narrationIndex,
  renderKey,
  enabled,
  rate,
  isPaused,
  onAdvanceChunk,
}: UseClassroomVoiceParams): void {
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);
  const onAdvanceRef = useRef(onAdvanceChunk);
  onAdvanceRef.current = onAdvanceChunk;

  // Las voces del navegador pueden cargar de forma asíncrona.
  useEffect(() => {
    if (!isSpeechSupported()) return;
    function loadVoice() {
      voiceRef.current = pickSpanishVoice(getAvailableVoices());
    }
    loadVoice();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoice);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoice);
  }, []);

  // Habla el chunk de narración actual cuando la voz está activa. Avanzar
  // narrationIndex (vía onAdvanceChunk) re-dispara este efecto y hace que
  // se lea el siguiente chunk automáticamente; al llegar al último chunk
  // simplemente no se agenda nada más (sección 25: no se avanza de escena
  // sola, el alumno controla "Siguiente").
  useEffect(() => {
    if (!enabled || !scene) {
      cancelSpeech();
      return;
    }
    const chunk = scene.narration[narrationIndex];
    if (!chunk) return;

    cancelSpeech();
    speakText(chunk.text, {
      rate,
      voice: voiceRef.current,
      onEnd: () => onAdvanceRef.current(),
    });

    return () => cancelSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scene?.scene_id, narrationIndex, renderKey, rate]);

  // Pause/Resume controla la síntesis en curso sin reiniciar el utterance.
  useEffect(() => {
    if (!enabled) return;
    if (isPaused) pauseSpeech();
    else resumeSpeech();
  }, [enabled, isPaused]);

  // Cancelar al desmontar el aula (evita voces superpuestas al navegar).
  useEffect(() => () => cancelSpeech(), []);
}
