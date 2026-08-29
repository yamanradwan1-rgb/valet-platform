export const RETRIEVAL_TASK_ALERT_AUDIO_PATH =
  "/sounds/retrieval-task-alert.wav";

export interface RetrievalAlertAudioEnvironment {
  readonly createAudio: (path: string) => { play: () => Promise<void> | void };
  readonly isForeground: () => boolean;
}

function browserAudioEnvironment(): RetrievalAlertAudioEnvironment | null {
  if (typeof document === "undefined" || typeof Audio === "undefined") {
    return null;
  }
  return {
    createAudio: (path) => new Audio(path),
    isForeground: () => document.visibilityState === "visible",
  };
}

export function attemptRetrievalTaskAlertAudio(
  environment = browserAudioEnvironment(),
): void {
  if (environment === null || !environment.isForeground()) {
    return;
  }

  try {
    const playback = environment
      .createAudio(RETRIEVAL_TASK_ALERT_AUDIO_PATH)
      .play();
    if (playback !== undefined) void playback.catch(() => undefined);
  } catch {
    // Sound is supplementary. Visual and canonical queue state remain intact.
  }
}
