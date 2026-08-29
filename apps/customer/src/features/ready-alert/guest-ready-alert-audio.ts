export const VEHICLE_READY_ALERT_AUDIO_PATH =
  '/sounds/vehicle-ready-alert.wav';

export interface GuestReadyAlertAudioEnvironment {
  readonly createAudio: (path: string) => { play: () => Promise<void> | void };
  readonly isForeground: () => boolean;
}

function browserAudioEnvironment(): GuestReadyAlertAudioEnvironment | null {
  if (typeof document === 'undefined' || typeof Audio === 'undefined') {
    return null;
  }
  return {
    createAudio: (path) => new Audio(path),
    isForeground: () => document.visibilityState === 'visible',
  };
}

export function attemptGuestReadyAlertAudio(
  environment = browserAudioEnvironment(),
): void {
  if (environment === null || !environment.isForeground()) return;

  try {
    const playback = environment
      .createAudio(VEHICLE_READY_ALERT_AUDIO_PATH)
      .play();
    if (playback !== undefined) void playback.catch(() => undefined);
  } catch {
    // Sound is supplementary; the visual and canonical session stay intact.
  }
}
