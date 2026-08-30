import { afterEach, describe, expect, it, vi } from "vitest";

type Cleanup = (() => void) | void;
interface EffectSlot {
  cleanup: Cleanup;
  create: () => Cleanup;
  dependencies: readonly unknown[] | undefined;
  pending: boolean;
}

function sameDependencies(
  left: readonly unknown[] | undefined,
  right: readonly unknown[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return false;
  return left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));
}

function createHookRuntime() {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const callbacks: Array<{ dependencies: readonly unknown[]; value: unknown }> = [];
  const effects: EffectSlot[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let callbackIndex = 0;
  let effectIndex = 0;

  const beginRender = (): void => {
    stateIndex = 0;
    refIndex = 0;
    callbackIndex = 0;
    effectIndex = 0;
  };

  return {
    module: {
      useCallback<TValue>(value: TValue, dependencies: readonly unknown[]): TValue {
        const index = callbackIndex++;
        const current = callbacks[index];
        if (current === undefined || !sameDependencies(current.dependencies, dependencies)) {
          callbacks[index] = { dependencies, value };
          return value;
        }
        return current.value as TValue;
      },
      useEffect(create: () => Cleanup, dependencies?: readonly unknown[]): void {
        const index = effectIndex++;
        const current = effects[index];
        effects[index] = {
          cleanup: current?.cleanup,
          create,
          dependencies,
          pending: current === undefined ||
            !sameDependencies(current.dependencies, dependencies),
        };
      },
      useRef<TValue>(initial: TValue): { current: TValue } {
        const index = refIndex++;
        refs[index] ??= { current: initial };
        return refs[index] as { current: TValue };
      },
      useState<TValue>(initial: TValue): [
        TValue,
        (next: TValue | ((value: TValue) => TValue)) => void,
      ] {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index] as TValue,
          (next) => {
            const previous = states[index] as TValue;
            states[index] = typeof next === "function"
              ? (next as (value: TValue) => TValue)(previous)
              : next;
          },
        ];
      },
    },
    flushEffects(): void {
      for (const effect of effects) {
        if (!effect.pending) continue;
        if (typeof effect.cleanup === "function") effect.cleanup();
        effect.cleanup = effect.create();
        effect.pending = false;
      }
    },
    render<TValue>(renderHook: () => TValue): TValue {
      beginRender();
      return renderHook();
    },
    unmount(): void {
      for (const effect of effects) {
        if (typeof effect.cleanup === "function") effect.cleanup();
      }
    },
  };
}

afterEach(() => {
  vi.doUnmock("react");
  vi.resetModules();
});

describe("usePlateCamera startup lifecycle", () => {
  it("mounts the preview before one open and ignores unrelated rerenders", async () => {
    const runtime = createHookRuntime();
    const stop = vi.fn<() => void>();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    const video = { srcObject: null } as unknown as HTMLVideoElement;
    const canvas = { getContext: vi.fn() } as unknown as HTMLCanvasElement;
    const openCamera = vi.fn(async (target: HTMLVideoElement) => {
      expect(target).toBe(video);
      target.srcObject = stream;
      return stream;
    });
    const options = {
      identityKey: "member-a:location-a",
      openCamera,
      probeEnvironment: () => ({ hasMediaDevices: true, isSecureContext: true }),
    };

    vi.doMock("react", () => runtime.module);
    const { usePlateCamera } = await import("./use-plate-camera");
    const render = () => runtime.render(() => usePlateCamera(options));

    let camera = render();
    runtime.flushEffects();
    expect(camera.state).toBe("idle");
    camera.start();
    expect(openCamera).not.toHaveBeenCalled();

    camera = render();
    expect(camera.state).toBe("starting");
    camera.videoRef.current = video;
    camera.canvasRef.current = canvas;
    expect(openCamera).not.toHaveBeenCalled();
    runtime.flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(openCamera).toHaveBeenCalledTimes(1);

    camera = render();
    runtime.flushEffects();
    expect(camera.state).toBe("preview");
    camera = render();
    runtime.flushEffects();
    expect(openCamera).toHaveBeenCalledTimes(1);

    camera.close();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it("releases an active stream on unmount and identity change", async () => {
    const runtime = createHookRuntime();
    const stops = [vi.fn<() => void>(), vi.fn<() => void>()];
    const streams = stops.map((stop) => ({
      getTracks: () => [{ stop }],
    } as unknown as MediaStream));
    const video = { srcObject: null } as unknown as HTMLVideoElement;
    const openCamera = vi.fn(async (target: HTMLVideoElement) => {
      const stream = streams.shift();
      if (stream === undefined) throw new Error("missing stream");
      target.srcObject = stream;
      return stream;
    });
    vi.doMock("react", () => runtime.module);
    const { usePlateCamera } = await import("./use-plate-camera");
    let identityKey = "member-a:location-a";
    const render = () => runtime.render(() => usePlateCamera({
      identityKey,
      openCamera,
      probeEnvironment: () => ({ hasMediaDevices: true, isSecureContext: true }),
    }));

    let camera = render();
    runtime.flushEffects();
    camera.start();
    camera = render();
    camera.videoRef.current = video;
    runtime.flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
    render();
    runtime.flushEffects();
    identityKey = "member-b:location-b";
    render();
    runtime.flushEffects();
    expect(stops[0]).toHaveBeenCalledTimes(1);

    camera = render();
    camera.start();
    camera = render();
    camera.videoRef.current = video;
    runtime.flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
    runtime.unmount();
    expect(stops[1]).toHaveBeenCalledTimes(1);
  });
});
