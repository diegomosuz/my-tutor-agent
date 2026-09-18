import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: { getSystemStatus: vi.fn() },
}));

import { api } from "../../api/client";
import { useVoicePreference } from "../useVoicePreference";

const mockedGetStatus = api.getSystemStatus as unknown as ReturnType<typeof vi.fn>;

function statusWith(voice: { provider: string; neural_configured: boolean; tts_model: string }) {
  return {
    app_version: "0.7.0",
    backend: "ok",
    courses: { count: 1, diagnostics: "ok" },
    llm: { provider: "pwc", model: "", configured: false, prompt_version: "", certification_prompt_version: "" },
    voice,
    cache_writable: true,
  };
}

beforeEach(() => {
  mockedGetStatus.mockReset();
});

describe("useVoicePreference", () => {
  it("auto + neural configurado -> useNeural=true", async () => {
    mockedGetStatus.mockResolvedValue(
      statusWith({ provider: "auto", neural_configured: true, tts_model: "gpt-4o-mini-tts" })
    );
    const { result } = renderHook(() => useVoicePreference());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.useNeural).toBe(true);
  });

  it("auto + neural NO configurado -> useNeural=false (fallback a browser)", async () => {
    mockedGetStatus.mockResolvedValue(
      statusWith({ provider: "auto", neural_configured: false, tts_model: "gpt-4o-mini-tts" })
    );
    const { result } = renderHook(() => useVoicePreference());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.useNeural).toBe(false);
  });

  it("provider=browser -> useNeural=false SIEMPRE, incluso con credencial configurada", async () => {
    mockedGetStatus.mockResolvedValue(
      statusWith({ provider: "browser", neural_configured: true, tts_model: "gpt-4o-mini-tts" })
    );
    const { result } = renderHook(() => useVoicePreference());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.useNeural).toBe(false);
  });

  it("provider=openai + configurado -> useNeural=true", async () => {
    mockedGetStatus.mockResolvedValue(
      statusWith({ provider: "openai", neural_configured: true, tts_model: "gpt-4o-mini-tts" })
    );
    const { result } = renderHook(() => useVoicePreference());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.useNeural).toBe(true);
  });

  it("si falla el fetch de estado, useNeural queda false (fallback seguro)", async () => {
    mockedGetStatus.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useVoicePreference());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.useNeural).toBe(false);
  });

  it("nunca expone una API key: voiceStatus solo tiene provider/neural_configured/tts_model", async () => {
    mockedGetStatus.mockResolvedValue(
      statusWith({ provider: "auto", neural_configured: true, tts_model: "gpt-4o-mini-tts" })
    );
    const { result } = renderHook(() => useVoicePreference());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(Object.keys(result.current.voiceStatus ?? {}).sort()).toEqual(
      ["neural_configured", "provider", "tts_model"].sort()
    );
  });
});
