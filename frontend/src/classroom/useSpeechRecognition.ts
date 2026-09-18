import { useEffect, useMemo, useRef, useState } from "react";
import {
  createRecognizer,
  isSpeechRecognitionSupported,
  type RecognizerHandle,
} from "./speechRecognition";

export interface UseSpeechRecognitionResult {
  supported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  resetTranscript: () => void;
}

/** Hook delgado sobre `speechRecognition.ts`, testeable mediante mocks del
 * módulo (sin lógica de la API del navegador acá adentro). */
export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const supported = useMemo(() => isSpeechRecognitionSupported(), []);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<RecognizerHandle | null>(null);

  function start() {
    if (!supported || isListening) return;
    setError(null);
    const handle = createRecognizer({
      onResult: (text) => setTranscript(text),
      onError: (message) => {
        setError(message);
        setIsListening(false);
      },
      onEnd: () => setIsListening(false),
    });
    if (!handle) return;
    handleRef.current = handle;
    setIsListening(true);
    handle.start();
  }

  function stop() {
    handleRef.current?.stop();
    setIsListening(false);
  }

  function resetTranscript() {
    setTranscript("");
  }

  // Detener el reconocimiento al desmontar (cambio de tópico, salir del aula).
  useEffect(() => {
    return () => {
      handleRef.current?.stop();
    };
  }, []);

  return { supported, isListening, transcript, error, start, stop, resetTranscript };
}
