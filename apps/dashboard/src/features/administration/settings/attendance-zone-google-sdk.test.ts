import { afterEach, beforeEach, expect, it, vi } from "vitest";

type TestHost = {
  google?: { maps: { marker: object } };
  gm_authFailure?: () => void;
  vayletAttendanceCallbacks?: Record<string, (() => void) | undefined>;
};
let host: TestHost;
let scripts: {
  src: string;
  nonce: string;
  async: boolean;
  onerror: (() => void) | null;
  remove: ReturnType<typeof vi.fn>;
}[];
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  host = {};
  scripts = [];
  vi.stubGlobal("window", host);
  vi.stubGlobal("document", {
    createElement: () => {
      const script = {
        src: "",
        nonce: "",
        async: false,
        onerror: null,
        remove: vi.fn(),
      };
      scripts.push(script);
      return script;
    },
    querySelector: () => ({ nonce: "test-nonce" }),
    head: { append: vi.fn() },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("missing key loads nothing and yields unavailable manual fallback", async () => {
  const { loadAttendanceGoogleSdk } =
    await import("./attendance-zone-google-sdk");
  await expect(loadAttendanceGoogleSdk("")).rejects.toThrow("Map unavailable");
  expect(scripts).toHaveLength(0);
});
it("lazy official SDK is single-flight, async, nonce preserving and marker-only", async () => {
  const { loadAttendanceGoogleSdk } =
    await import("./attendance-zone-google-sdk");
  const first = loadAttendanceGoogleSdk("fixture-only");
  expect(loadAttendanceGoogleSdk("fixture-only")).toBe(first);
  expect(scripts).toHaveLength(1);
  const url = new URL(scripts[0]!.src);
  expect(url.origin).toBe("https://maps.googleapis.com");
  expect(url.searchParams.get("libraries")).toBe("marker");
  expect(url.searchParams.get("loading")).toBe("async");
  expect(scripts[0]!.nonce).toBe("test-nonce");
  expect(scripts[0]!.async).toBe(true);
  host.google = { maps: { marker: {} } };
  Object.values(host.vayletAttendanceCallbacks!)[0]!();
  expect(await first).toBe(host.google.maps);
  expect(Object.keys(host.vayletAttendanceCallbacks!)).toEqual([]);
  expect(await loadAttendanceGoogleSdk("fixture-only")).toBe(host.google.maps);
  expect(scripts).toHaveLength(1);
});
it("network failure permits explicit retry and retires old provider callbacks", async () => {
  const { loadAttendanceGoogleSdk } =
    await import("./attendance-zone-google-sdk");
  const first = loadAttendanceGoogleSdk("fixture-only");
  const retired = Object.values(host.vayletAttendanceCallbacks!)[0]!;
  const rejected = expect(first).rejects.toThrow("Map unavailable");
  scripts[0]!.onerror!();
  await rejected;
  expect(scripts[0]!.remove).toHaveBeenCalledOnce();
  const retry = loadAttendanceGoogleSdk("fixture-only");
  expect(scripts).toHaveLength(2);
  host.google = { maps: { marker: {} } };
  retired();
  expect(Object.keys(host.vayletAttendanceCallbacks!)).toHaveLength(1);
  Object.values(host.vayletAttendanceCallbacks!)[0]!();
  expect(await retry).toBe(host.google.maps);
});
it("timeout removes failed loader rather than leaving permanent loading", async () => {
  const { loadAttendanceGoogleSdk } =
    await import("./attendance-zone-google-sdk");
  const rejected = expect(
    loadAttendanceGoogleSdk("fixture-only"),
  ).rejects.toThrow("Map unavailable");
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
  expect(scripts[0]!.remove).toHaveBeenCalledOnce();
  expect(Object.keys(host.vayletAttendanceCallbacks!)).toEqual([]);
});
it("authorization failure reaches mounted subscribers; detached listeners stay retired", async () => {
  const { loadAttendanceGoogleSdk, onAttendanceMapFailure } =
    await import("./attendance-zone-google-sdk");
  const active = vi.fn();
  const retired = vi.fn();
  onAttendanceMapFailure(active);
  onAttendanceMapFailure(retired)();
  const rejected = expect(
    loadAttendanceGoogleSdk("fixture-only"),
  ).rejects.toThrow("Map unavailable");
  host.gm_authFailure!();
  await rejected;
  expect(active).toHaveBeenCalledOnce();
  expect(retired).not.toHaveBeenCalled();
  await expect(loadAttendanceGoogleSdk("fixture-only")).rejects.toThrow(
    "Map unavailable",
  );
  expect(scripts).toHaveLength(1);
});
