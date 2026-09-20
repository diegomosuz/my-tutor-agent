import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { synthesizeSpeech: vi.fn() },
}));

import { api } from "../../api/client";
import { claimAiAudioPriority } from "../readAloudPriority";
import { useReadAloud } from "../useReadAloud";

const mockedSynthesize = api.synthesizeSpeech as unknown as ReturnType<typeof vi.fn>;

let lastMockAudio: MockAudio | null = null;

class MockAudio {
  src = "";
  paused = true;
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  constructor(src: string) {
    this.src = src;
    lastMockAudio = this;
  }
}

function makeContainer(html: string): { current: HTMLDivElement } {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return { current: div };
}

beforeEach(() => {
  lastMockAudio = null;
  mockedSynthesize.mockReset();
  mockedSynthesize.mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
  // @ts-expect-error jsdom no implementa HTMLAudioElement de verdad
  globalThis.Audio = MockAudio;
  globalThis.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useReadAloud", () => {
  it("1. idle inicial, con contenido legible detectado", () => {
    const containerRef = makeContainer("<p>Texto de prueba.</p>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: true,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: false,
      })
    );
    expect(result.current.state).toBe("idle");
    expect(result.current.hasReadableContent).toBe(true);
    expect(result.current.disabled).toBe(false);
  });

  it("2. sin contenido legible, hasReadableContent=false y disabled=true", () => {
    const containerRef = makeContainer("<div></div>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: true,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: false,
      })
    );
    expect(result.current.hasReadableContent).toBe(false);
    expect(result.current.disabled).toBe(true);
  });

  it("3. play() pasa a loading y luego a playing (onStart real)", async () => {
    const containerRef = makeContainer("<p>Un único segmento.</p>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: true,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: false,
      })
    );
    act(() => result.current.play());
    await waitFor(() => expect(result.current.state).toBe("playing"));
  });

  it("4. al terminar el único segmento (onended real), pasa a completed", async () => {
    const containerRef = makeContainer("<p>Solo una frase.</p>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: true,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: false,
      })
    );
    act(() => result.current.play());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    act(() => lastMockAudio?.onended?.());
    await waitFor(() => expect(result.current.state).toBe("completed"));
  });

  it("5. pause()/resume() alternan estado sin reiniciar el segmento", async () => {
    const containerRef = makeContainer("<p>Frase de prueba para pausar.</p>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: true,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: false,
      })
    );
    act(() => result.current.play());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    act(() => result.current.pause());
    expect(result.current.state).toBe("paused");
    act(() => result.current.resume());
    expect(result.current.state).toBe("playing");
  });

  it("6. stop() vuelve a idle desde cualquier estado activo", async () => {
    const containerRef = makeContainer("<p>Frase para detener.</p>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: true,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: false,
      })
    );
    act(() => result.current.play());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    act(() => result.current.stop());
    expect(result.current.state).toBe("idle");
  });

  it("7. reclamar prioridad de IA detiene el Reader inmediatamente (PARTE 5/6)", async () => {
    const containerRef = makeContainer("<p>Frase que se interrumpe.</p>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: true,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: false,
      })
    );
    act(() => result.current.play());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    act(() => claimAiAudioPriority());
    expect(result.current.state).toBe("idle");
  });

  it("8. aiAudioSessionActive=true deshabilita el Reader (nunca le roba el turno a IA)", () => {
    const containerRef = makeContainer("<p>Texto.</p>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: true,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: true,
      })
    );
    expect(result.current.disabled).toBe(true);
    act(() => result.current.play());
    expect(result.current.state).toBe("idle"); // play() no hace nada mientras está disabled
  });

  it("9. cambiar topicKey reinicia el Reader a idle y recalcula segmentos", async () => {
    const containerRef = makeContainer("<p>Tópico A.</p>");
    const { result, rerender } = renderHook(
      ({ topicKey, containerRef: ref }: { topicKey: string; containerRef: { current: HTMLDivElement } }) =>
        useReadAloud({
          containerRef: ref,
          active: true,
          topicKey,
          useNeural: true,
          aiAudioSessionActive: false,
        }),
      { initialProps: { topicKey: "curso:modulo:topicoA", containerRef } }
    );
    act(() => result.current.play());
    await waitFor(() => expect(result.current.state).toBe("playing"));

    const newContainerRef = makeContainer("<p>Tópico B, contenido distinto.</p>");
    rerender({ topicKey: "curso:modulo:topicoB", containerRef: newContainerRef });

    expect(result.current.state).toBe("idle");
  });

  it("10. rate por default es 1.0 y setRate lo cambia", () => {
    const containerRef = makeContainer("<p>Texto.</p>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: true,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: false,
      })
    );
    expect(result.current.rate).toBe(1.0);
    act(() => result.current.setRate(1.5));
    expect(result.current.rate).toBe(1.5);
  });

  it("11. active=false nunca construye segmentos ni permite reproducir", () => {
    const containerRef = makeContainer("<p>Texto oculto (otro tab).</p>");
    const { result } = renderHook(() =>
      useReadAloud({
        containerRef,
        active: false,
        topicKey: "curso:modulo:topico",
        useNeural: true,
        aiAudioSessionActive: false,
      })
    );
    expect(result.current.hasReadableContent).toBe(false);
    expect(result.current.disabled).toBe(true);
  });
});
