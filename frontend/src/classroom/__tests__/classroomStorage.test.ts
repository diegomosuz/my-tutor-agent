import { beforeEach, describe, expect, it } from "vitest";
import {
  loadTopicProgress,
  loadVoiceEnabled,
  loadVoiceSpeed,
  saveTopicProgress,
  saveVoiceEnabled,
  saveVoiceSpeed,
} from "../classroomStorage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("classroomStorage", () => {
  it("10. la preferencia de voz activa persiste en localStorage", () => {
    expect(loadVoiceEnabled()).toBe(false); // default
    saveVoiceEnabled(true);
    expect(loadVoiceEnabled()).toBe(true);
    saveVoiceEnabled(false);
    expect(loadVoiceEnabled()).toBe(false);
  });

  it("11. la velocidad de voz persiste en localStorage", () => {
    expect(loadVoiceSpeed()).toBe(1.0); // default
    saveVoiceSpeed(1.3);
    expect(loadVoiceSpeed()).toBe(1.3);
    saveVoiceSpeed(0.85);
    expect(loadVoiceSpeed()).toBe(0.85);
  });

  it("ignora un valor de velocidad guardado que no sea una opción válida", () => {
    window.localStorage.setItem("pwc-tutor:voice-speed", "2.5");
    expect(loadVoiceSpeed()).toBe(1.0);
  });

  it("guarda y recupera el progreso de un tópico", () => {
    const progress = {
      courseId: "c1",
      moduleId: "m1",
      topicId: "t1",
      contentSha256: "hash-1",
      currentSceneIndex: 2,
      completed: true,
      updatedAt: "2026-01-01T00:00:00Z",
    };
    saveTopicProgress(progress);
    expect(loadTopicProgress("c1", "m1", "t1")).toEqual(progress);
  });

  it("devuelve null si no hay progreso guardado para ese tópico", () => {
    expect(loadTopicProgress("no-existe", "no-existe", "no-existe")).toBeNull();
  });
});
