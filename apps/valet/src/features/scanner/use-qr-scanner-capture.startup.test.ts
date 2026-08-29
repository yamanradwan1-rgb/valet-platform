import { afterEach, describe, expect, it, vi } from "vitest";

type EffectCleanup = (() => void) | void;

interface EffectSlot {
  cleanup: EffectCleanup;
  create: () => EffectCleanup;
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

/** Minimal deterministic hook scheduler for this hook's React boundary. */
function createHookRuntime() {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const callbacks: Array<{
    dependencies: readonly unknown[];
    value: unknown;
  }> = [];
  const effects: EffectSlot[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let callbackIndex = 0;
  let effectIndex = 0;

  function beginRender(): void {
    stateIndex = 0;
    refIndex = 0;
    callbackIndex = 0;
    effectIndex = 0;
  }

  return {
    module: {
      useCallback<TValue>(
        value: TValue,
        dependencies: readonly unknown[],
      ): TValue {
        const index = callbackIndex++;
        const current = callbacks[index];
        if (
          current === undefined ||
          !sameDependencies(current.dependencies, dependencies)
        ) {
          callbacks[index] = { dependencies, value };
          return value;
        }
        return current.value as TValue;
      },
      useEffect(
        create: () => EffectCleanup,
        dependencies?: readonly unknown[],
      ): void {
        const index = effectIndex++;
        const current = effects[index];
        const pending =
          current === undefined ||
          !sameDependencies(current.dependencies, dependencies);
        effects[index] = {
          cleanup: current?.cleanup,
          create,
          dependencies,
          pending,
        };
      },
      useRef<TValue>(initial: TValue): { current: TValue } {
        const index = refIndex++;
        refs[index] ??= { current: initial };
        return refs[index] as { current: TValue };
      },
      useState<TValue>(
        initial: TValue,
      ): [TValue, (next: TValue | ((value: TValue) => TValue)) => void] {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index] as TValue,
          (next) => {
            const previous = states[index] as TValue;
            states[index] =
              typeof next === "function"
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
  vi.doUnmock("./zxing-camera-opener");
  vi.resetModules();
});

describe("useQrScannerCapture startup lifecycle", () => {
  it("opens once after preview commit, ignores rerenders, and releases on close and unmount", async () => {
    const runtime = createHookRuntime();
    const decoderStop = vi.fn<() => void>();
    const trackStop = vi.fn<() => void>();
    const preview = {
      srcObject: { getTracks: () => [{ stop: trackStop }] },
    } as unknown as HTMLVideoElement;
    const openCamera = vi.fn(async ({ video }: { video: HTMLVideoElement }) => {
      expect(video).toBe(preview);
      return { stop: decoderStop };
    });

    vi.doMock("react", () => runtime.module);
    vi.doMock("./zxing-camera-opener", () => ({
      openZxingQrCamera: openCamera,
    }));
    const { useQrScannerCapture } = await import(
      "./use-qr-scanner-capture"
    );
    const options = {
      interpret: (text: string) => ({ ok: true as const, value: text }),
      onDecoded: vi.fn<(value: string) => void>(),
      probeEnvironment: () => ({
        hasMediaDevices: true,
        isSecureContext: true,
      }),
    };
    const render = () => runtime.render(() => useQrScannerCapture(options));

    let scanner = render();
    runtime.flushEffects();
    expect(scanner.uiState).toBe("idle");
    expect(scanner.videoRef.current).toBeNull();

    await scanner.start();
    expect(openCamera).not.toHaveBeenCalled();
    scanner = render();
    expect(scanner.uiState).toBe("starting");
    scanner.videoRef.current = preview;
    expect(openCamera).not.toHaveBeenCalled();

    runtime.flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(openCamera).toHaveBeenCalledTimes(1);
    scanner = render();
    runtime.flushEffects();
    expect(scanner.uiState).toBe("scanning");

    scanner = render();
    runtime.flushEffects();
    expect(openCamera).toHaveBeenCalledTimes(1);

    scanner.close();
    expect(decoderStop).toHaveBeenCalledTimes(1);
    expect(trackStop).toHaveBeenCalledTimes(1);

    scanner = render();
    await scanner.start();
    scanner = render();
    scanner.videoRef.current = preview;
    runtime.flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(openCamera).toHaveBeenCalledTimes(2);

    runtime.unmount();
    expect(decoderStop).toHaveBeenCalledTimes(2);
    expect(trackStop).toHaveBeenCalledTimes(2);
  });
});
