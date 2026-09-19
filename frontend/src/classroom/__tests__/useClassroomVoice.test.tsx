// Tests de useClassroomVoice (v1.3.0, bloque "Classroom UX + Voice
// Lifecycle", PARTE 8): confirma que el hook dispara cancelación en los
// momentos correctos del ciclo de vida (cambio de escena, Voice OFF,
// Repeat, unmount, navegación rápida) -- la protección de la respuesta
// TTS async obsoleta en sí (PARTE 8.C) se testea a nivel más bajo en
// neuralSpeech.test.ts, donde vive la causa raíz real.
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClassroomVoice, type UseClassroomVoiceParams } from "../useClassroomVoice";
import type { LessonScene } from "../../types/api";

const mockCancelAll = vi.fn();
const mockPauseAll = vi.fn();
const mockResumeAll = vi.fn();
const mockSpeakSequenceUnified = vi.fn();
const cancelFns: Array<() => void> = [];

vi.mock("../voicePlayback", () => ({
  cancelAllSpeech: () => mockCancelAll(),
  pauseAllSpeech: () => mockPauseAll(),
  resumeAllSpeech: () => mockResumeAll(),
  speakSequenceUnified: (texts: string[], options: unknown) => {
    mockSpeakSequenceUnified(texts, options);
    const cancel = vi.fn();
    cancelFns.push(cancel);
    return cancel;
  },
}));

vi.mock("../speech", () => ({
  isSpeechSupported: () => false, // evita el efecto de carga de voces del navegador
  getAvailableVoices: () => [],
  pickSpanishVoice: () => undefined,
}));

function makeScene(id: string): LessonScene {
  return {
    scene_id: id,
    scene_type: "explanation",
    title: { text: id, source_refs: ["SRC-001"] },
    key_points: [],
    narration: [{ text: `Narración de ${id}`, source_refs: ["SRC-001"] }],
    visual: {
      visual_type: "none",
      layout_hint: "default",
      source_refs: [],
      description: "",
      emphasis: "neutral",
      process_steps: [],
      comparison: null,
      nodes: [],
      edges: [],
    },
    interaction: null,
  };
}

function Harness(props: UseClassroomVoiceParams) {
  useClassroomVoice(props);
  return null;
}

function baseProps(overrides: Partial<UseClassroomVoiceParams> = {}): UseClassroomVoiceParams {
  return {
    scene: makeScene("SCENE-001"),
    narrationIndex: 0,
    renderKey: 0,
    enabled: true,
    rate: 1.0,
    isPaused: false,
    useNeural: false,
    onAdvanceChunk: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockCancelAll.mockClear();
  mockPauseAll.mockClear();
  mockResumeAll.mockClear();
  mockSpeakSequenceUnified.mockClear();
  cancelFns.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useClassroomVoice — v1.3.0 lifecycle de cancelación", () => {
  it("A/B: cambiar de escena (Next) cancela la reproducción anterior antes de empezar la nueva", () => {
    const { rerender } = render(<Harness {...baseProps({ scene: makeScene("SCENE-001") })} />);
    expect(mockSpeakSequenceUnified).toHaveBeenCalledTimes(1);
    expect(cancelFns).toHaveLength(1);

    rerender(<Harness {...baseProps({ scene: makeScene("SCENE-002") })} />);

    // El cleanup de la secuencia de SCENE-001 se invoca ANTES de que
    // arranque la de SCENE-002 (orden de efectos de React: cleanup
    // primero, luego el nuevo efecto).
    expect(cancelFns[0]).toHaveBeenCalledTimes(1);
    expect(mockSpeakSequenceUnified).toHaveBeenCalledTimes(2);
  });

  it("E: Voice OFF (enabled=false) detiene la reproducción de inmediato", () => {
    const { rerender } = render(<Harness {...baseProps({ enabled: true })} />);
    expect(cancelFns).toHaveLength(1);

    rerender(<Harness {...baseProps({ enabled: false })} />);

    expect(cancelFns[0]).toHaveBeenCalledTimes(1); // cleanup de la secuencia activa
    expect(mockCancelAll).toHaveBeenCalled(); // rama enabled=false llama cancelAllSpeech directamente
  });

  it("D: Repeat (mismo scene_id, nuevo renderKey) detiene la reproducción anterior antes de reproducir de nuevo", () => {
    const { rerender } = render(
      <Harness {...baseProps({ scene: makeScene("SCENE-001"), renderKey: 0 })} />
    );
    expect(mockSpeakSequenceUnified).toHaveBeenCalledTimes(1);

    rerender(<Harness {...baseProps({ scene: makeScene("SCENE-001"), renderKey: 1 })} />);

    expect(cancelFns[0]).toHaveBeenCalledTimes(1); // stop antes de re-reproducir
    expect(mockSpeakSequenceUnified).toHaveBeenCalledTimes(2); // replay real
  });

  it("F: unmount limpia la reproducción activa (evita voces superpuestas al salir del aula)", () => {
    const { unmount } = render(<Harness {...baseProps()} />);
    expect(cancelFns).toHaveLength(1);

    unmount();

    // Tanto el cleanup de la secuencia activa como el cleanup dedicado de
    // desmontaje (línea final del hook) deben haber corrido.
    expect(cancelFns[0]).toHaveBeenCalledTimes(1);
    expect(mockCancelAll).toHaveBeenCalled();
  });

  it("G: navegación rápida (Next/Next/Prev) nunca dispara más de una síntesis viva a la vez", () => {
    const { rerender } = render(<Harness {...baseProps({ scene: makeScene("SCENE-001") })} />);
    rerender(<Harness {...baseProps({ scene: makeScene("SCENE-002") })} />);
    rerender(<Harness {...baseProps({ scene: makeScene("SCENE-003") })} />);
    rerender(<Harness {...baseProps({ scene: makeScene("SCENE-002") })} />);

    // 4 escenas -> 4 llamadas a speakSequenceUnified, pero cada una de las
    // 3 primeras fue cancelada antes de que la siguiente arrancara (nunca
    // dos "activas" al mismo tiempo desde la perspectiva del hook).
    expect(mockSpeakSequenceUnified).toHaveBeenCalledTimes(4);
    expect(cancelFns.slice(0, 3).every((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls.length === 1)).toBe(
      true
    );
  });

  it("scene null / enabled false: nunca deja una síntesis colgada, siempre cancela", () => {
    render(<Harness {...baseProps({ scene: null })} />);
    expect(mockCancelAll).toHaveBeenCalled();
    expect(mockSpeakSequenceUnified).not.toHaveBeenCalled();
  });
});
