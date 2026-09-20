// Orquestación de la narración de la escena activa (Fase 4, extendido en
// Fase 7 con voz neural opcional). Deliberadamente separado de
// useClassroomEngine: el engine solo expone los puntos de integración que
// la voz necesita (escena actual, currentNarrationIndex,
// nextNarrationChunk) sin saber nada de síntesis de voz.
import { useEffect, useRef } from "react";
import type { LessonScene } from "../types/api";
import { claimAiAudioPriority } from "./readAloudPriority";
import { getAvailableVoices, isSpeechSupported, pickSpanishVoice } from "./speech";
import { cancelAllSpeech, pauseAllSpeech, resumeAllSpeech, speakSequenceUnified } from "./voicePlayback";

export interface UseClassroomVoiceParams {
  scene: LessonScene | null;
  narrationIndex: number;
  renderKey: number;
  enabled: boolean;
  rate: number;
  isPaused: boolean;
  useNeural: boolean;
  onAdvanceChunk: () => void;
  onNeuralError?: (message: string) => void;
}

export function useClassroomVoice({
  scene,
  narrationIndex,
  renderKey,
  enabled,
  rate,
  isPaused,
  useNeural,
  onAdvanceChunk,
  onNeuralError,
}: UseClassroomVoiceParams): void {
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);
  const onAdvanceRef = useRef(onAdvanceChunk);
  onAdvanceRef.current = onAdvanceChunk;
  const onNeuralErrorRef = useRef(onNeuralError);
  onNeuralErrorRef.current = onNeuralError;

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
  // narrationIndex re-dispara este efecto y lee el siguiente chunk
  // automáticamente; al llegar al último chunk no se agenda nada más
  // (sección 25 de Fase 5: no se avanza de escena sola).
  useEffect(() => {
    if (!enabled || !scene) {
      cancelAllSpeech();
      return;
    }
    const chunk = scene.narration[narrationIndex];
    if (!chunk) return;

    // v1.5.0 (PARTE 7/43): la narración de la clase SIEMPRE gana frente
    // al Markdown Reader -- se notifica en cada chunk nuevo (no solo al
    // activar la voz), cubre también el caso de reanudar después de un
    // "Continuar clase" con el Reader reproduciendo mientras tanto.
    claimAiAudioPriority();
    const cancelCurrent = speakSequenceUnified([chunk.text], {
      useNeural,
      rate,
      voice: voiceRef.current,
      onDone: () => onAdvanceRef.current(),
      onNeuralError: (message) => onNeuralErrorRef.current?.(message),
    });

    return cancelCurrent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scene?.scene_id, narrationIndex, renderKey, rate, useNeural]);

  // Pause/Resume controla la síntesis en curso sin reiniciar el utterance/
  // audio (funciona igual para ambos backends: speechSynthesis.pause()
  // preserva posición, y HTMLAudioElement.pause() también).
  useEffect(() => {
    if (!enabled) return;
    if (isPaused) pauseAllSpeech();
    else resumeAllSpeech();
  }, [enabled, isPaused]);

  // Cancelar al desmontar el aula (evita voces superpuestas al navegar).
  useEffect(() => () => cancelAllSpeech(), []);
}
