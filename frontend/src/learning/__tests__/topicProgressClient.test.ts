import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: {
    markTopicProgress: vi.fn(),
    resetCourseProgressServer: vi.fn(),
  },
}));

import { api } from "../../api/client";
import {
  markTopicCompletedServer,
  markTopicStartedServer,
  resetCourseProgressServer,
} from "../topicProgressClient";

const mockedMarkTopicProgress = api.markTopicProgress as unknown as ReturnType<typeof vi.fn>;
const mockedResetCourseProgressServer = api.resetCourseProgressServer as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedMarkTopicProgress.mockReset();
  mockedResetCourseProgressServer.mockReset();
});

describe("topicProgressClient", () => {
  it("markTopicStartedServer llama a PUT con action=start", () => {
    mockedMarkTopicProgress.mockResolvedValue({});
    markTopicStartedServer("curso-demo", "modulo-1", "topico-1");
    expect(mockedMarkTopicProgress).toHaveBeenCalledWith("curso-demo", "modulo-1", "topico-1", {
      action: "start",
    });
  });

  it("markTopicCompletedServer llama a PUT con action=complete", () => {
    mockedMarkTopicProgress.mockResolvedValue({});
    markTopicCompletedServer("curso-demo", "modulo-1", "topico-1");
    expect(mockedMarkTopicProgress).toHaveBeenCalledWith("curso-demo", "modulo-1", "topico-1", {
      action: "complete",
    });
  });

  it("markTopicStartedServer nunca lanza aunque el request falle (best-effort)", async () => {
    mockedMarkTopicProgress.mockRejectedValue(new Error("network"));
    expect(() => markTopicStartedServer("curso-demo", "modulo-1", "topico-1")).not.toThrow();
    // Deja que la promesa rechazada se resuelva antes de terminar el test.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("markTopicCompletedServer nunca lanza aunque el request falle (best-effort)", async () => {
    mockedMarkTopicProgress.mockRejectedValue(new Error("network"));
    expect(() => markTopicCompletedServer("curso-demo", "modulo-1", "topico-1")).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("resetCourseProgressServer SÍ propaga el error (acción explícita del alumno)", async () => {
    mockedResetCourseProgressServer.mockRejectedValue(new Error("network"));
    await expect(resetCourseProgressServer("curso-demo")).rejects.toThrow("network");
  });

  it("resetCourseProgressServer resuelve normalmente cuando el servidor responde ok", async () => {
    mockedResetCourseProgressServer.mockResolvedValue(undefined);
    await expect(resetCourseProgressServer("curso-demo")).resolves.toBeUndefined();
  });
});
