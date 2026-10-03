import { describe, expect, it, vi } from "vitest";
import { NativeAppearanceOwner } from "../src/appearance/native-appearance-owner";
import {
  parseNativeAppearance,
  serializeNativeAppearance,
} from "../src/appearance/native-appearance-store";

describe("strict device-local appearance preference", () => {
  it.each([
    null,
    "",
    "{",
    "null",
    "[]",
    '{"version":2,"theme":"dark"}',
    '{"version":1,"theme":"system"}',
    '{"version":1,"theme":"dark","userId":"x"}',
  ])("rejects %s safely to Light", (value) => {
    expect(parseNativeAppearance(value)).toBe("light");
  });
  it.each(["light", "dark"] as const)(
    "restores stored %s and contains only version/theme",
    async (mode) => {
      const value = serializeNativeAppearance(mode);
      expect(JSON.parse(value)).toEqual({ version: 1, theme: mode });
      const owner = new NativeAppearanceOwner({
        read: async () => value,
        write: vi.fn(),
      });
      expect(owner.current()).toEqual({ mode: "light", ready: false });
      await owner.restore();
      expect(owner.current()).toEqual({ mode, ready: true });
    },
  );
  it("immediately switches both directions, persists in order and survives restart", async () => {
    let value: string | null = null;
    const store = {
      read: async () => value,
      write: vi.fn(async (next: string) => {
        value = next;
      }),
    };
    const owner = new NativeAppearanceOwner(store);
    const notify = vi.fn();
    owner.subscribe(notify);
    await owner.restore();
    owner.select("dark");
    expect(owner.current().mode).toBe("dark");
    owner.select("light");
    expect(owner.current().mode).toBe("light");
    owner.select("dark");
    await owner.settled();
    expect(store.write.mock.calls.map(([v]) => JSON.parse(v).theme)).toEqual([
      "dark",
      "light",
      "dark",
    ]);
    const restarted = new NativeAppearanceOwner(store);
    await restarted.restore();
    expect(restarted.current().mode).toBe("dark");
    expect(notify).toHaveBeenCalledTimes(4);
  });
  it("read and write failures cannot block startup or further switches", async () => {
    const owner = new NativeAppearanceOwner({
      read: async () => {
        throw Error();
      },
      write: async () => {
        throw Error();
      },
    });
    await owner.restore();
    expect(owner.current()).toEqual({ mode: "light", ready: true });
    owner.select("dark");
    await owner.settled();
    expect(owner.current().mode).toBe("dark");
    owner.select("light");
    await owner.settled();
    expect(owner.current().mode).toBe("light");
  });
  it("a hung restore times out and late Dark cannot overwrite an explicit choice", async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    const read = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const owner = new NativeAppearanceOwner({ read, write: vi.fn() });
    const work = owner.restore();
    expect(owner.restore()).toBe(work);
    await vi.advanceTimersByTimeAsync(1500);
    await work;
    expect(owner.current()).toEqual({ mode: "light", ready: true });
    owner.select("dark");
    owner.select("light");
    resolve(serializeNativeAppearance("dark"));
    await Promise.resolve();
    expect(owner.current().mode).toBe("light");
    expect(read).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
