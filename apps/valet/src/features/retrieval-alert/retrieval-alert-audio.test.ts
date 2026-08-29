import { describe, expect, it, vi } from "vitest";

import {
  attemptRetrievalTaskAlertAudio,
  RETRIEVAL_TASK_ALERT_AUDIO_PATH,
} from "./retrieval-alert-audio";

describe("Retrieval foreground alert audio", () => {
  it("attempts the project-owned sound once while foregrounded", () => {
    const play = vi.fn(async () => undefined);
    const createAudio = vi.fn(() => ({ play }));
    attemptRetrievalTaskAlertAudio({ createAudio, isForeground: () => true });
    expect(createAudio).toHaveBeenCalledOnce();
    expect(createAudio).toHaveBeenCalledWith(RETRIEVAL_TASK_ALERT_AUDIO_PATH);
    expect(play).toHaveBeenCalledOnce();
  });

  it("does not attempt playback while backgrounded", () => {
    const createAudio = vi.fn(() => ({ play: vi.fn() }));
    attemptRetrievalTaskAlertAudio({ createAudio, isForeground: () => false });
    expect(createAudio).not.toHaveBeenCalled();
  });

  it("contains synchronous and rejected playback failures without retry", async () => {
    const rejectedPlay = vi.fn(() => Promise.reject(new Error("blocked")));
    const throwingPlay = vi.fn(() => {
      throw new Error("unavailable");
    });

    expect(() =>
      attemptRetrievalTaskAlertAudio({
        createAudio: () => ({ play: rejectedPlay }),
        isForeground: () => true,
      }),
    ).not.toThrow();
    await Promise.resolve();
    expect(rejectedPlay).toHaveBeenCalledOnce();

    expect(() =>
      attemptRetrievalTaskAlertAudio({
        createAudio: () => ({ play: throwingPlay }),
        isForeground: () => true,
      }),
    ).not.toThrow();
    expect(throwingPlay).toHaveBeenCalledOnce();
  });
});
