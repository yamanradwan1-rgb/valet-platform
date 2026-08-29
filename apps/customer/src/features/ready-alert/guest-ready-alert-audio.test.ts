import { describe, expect, it, vi } from 'vitest';

import {
  attemptGuestReadyAlertAudio,
  VEHICLE_READY_ALERT_AUDIO_PATH,
} from './guest-ready-alert-audio';

describe('Guest vehicle-ready foreground audio', () => {
  it('attempts the Customer-owned sound once while foregrounded', () => {
    const play = vi.fn(async () => undefined);
    const createAudio = vi.fn(() => ({ play }));
    attemptGuestReadyAlertAudio({ createAudio, isForeground: () => true });
    expect(createAudio).toHaveBeenCalledOnce();
    expect(createAudio).toHaveBeenCalledWith(VEHICLE_READY_ALERT_AUDIO_PATH);
    expect(play).toHaveBeenCalledOnce();
  });

  it('does not attempt sound while backgrounded', () => {
    const createAudio = vi.fn(() => ({ play: vi.fn() }));
    attemptGuestReadyAlertAudio({ createAudio, isForeground: () => false });
    expect(createAudio).not.toHaveBeenCalled();
  });

  it('contains rejected and synchronous playback failures without retry', async () => {
    const rejected = vi.fn(() => Promise.reject(new Error('blocked')));
    const throwing = vi.fn(() => {
      throw new Error('unavailable');
    });
    expect(() =>
      attemptGuestReadyAlertAudio({
        createAudio: () => ({ play: rejected }),
        isForeground: () => true,
      }),
    ).not.toThrow();
    await Promise.resolve();
    expect(rejected).toHaveBeenCalledOnce();

    expect(() =>
      attemptGuestReadyAlertAudio({
        createAudio: () => ({ play: throwing }),
        isForeground: () => true,
      }),
    ).not.toThrow();
    expect(throwing).toHaveBeenCalledOnce();
  });
});
