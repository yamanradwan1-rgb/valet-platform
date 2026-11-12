import type { Page } from "@playwright/test";

type HeldFrames = {
  request: typeof window.requestAnimationFrame;
  cancel: typeof window.cancelAnimationFrame;
  queued: Map<number, FrameRequestCallback>;
  nextId: number;
};

type WindowWithHeldFrames = Window & { __issue432HeldFrames?: HeldFrames };

export async function holdIssue432AnimationFrames(page: Page) {
  await page.evaluate(() => {
    const state: HeldFrames = {
      request: window.requestAnimationFrame.bind(window),
      cancel: window.cancelAnimationFrame.bind(window),
      queued: new Map(),
      nextId: 1,
    };
    (window as WindowWithHeldFrames).__issue432HeldFrames = state;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = state.nextId++;
      state.queued.set(id, callback);
      return id;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => { state.queued.delete(id); }) as typeof window.cancelAnimationFrame;
  });
  return {
    queuedCount: () => page.evaluate(() => (window as WindowWithHeldFrames).__issue432HeldFrames?.queued.size ?? 0),
    release: () => page.evaluate(() => {
      const target = window as WindowWithHeldFrames;
      const state = target.__issue432HeldFrames;
      if (!state) return;
      window.requestAnimationFrame = state.request;
      window.cancelAnimationFrame = state.cancel;
      const callbacks = [...state.queued.values()];
      state.queued.clear();
      delete target.__issue432HeldFrames;
      for (const callback of callbacks) state.request(callback);
    }),
  };
}
