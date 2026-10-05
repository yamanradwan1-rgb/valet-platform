import { afterEach, beforeEach, expect, it, vi } from "vitest";

type TestHost = {
  google?: { maps: { marker: object } };
  gm_authFailure?: () => void;
  vayletGoogleMapsCallbacks?: Record<string, (() => void) | undefined>;
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

it("missing key loads nothing and yields unavailable fallback", async () => {
  const { loadGoogleMapsSdk } = await import("./google-maps-sdk");
  await expect(loadGoogleMapsSdk("")).rejects.toThrow("Map unavailable");
  expect(scripts).toHaveLength(0);
});

it.each(["en", "ar"] as const)(
  "first SDK language %s stays fixed across locale changes",
  async (locale) => {
    const { loadGoogleMapsSdk, googleMapsLanguage } =
      await import("./google-maps-sdk");
    const first = loadGoogleMapsSdk("fixture-only", locale);
    expect(new URL(scripts[0]!.src).searchParams.get("language")).toBe(locale);
    host.google = { maps: { marker: {} } };
    Object.values(host.vayletGoogleMapsCallbacks!)[0]!();
    await first;
    await loadGoogleMapsSdk(
      "fixture-only",
      locale === "en" ? "ar" : "en",
    );
    expect(googleMapsLanguage()).toBe(locale);
    expect(scripts).toHaveLength(1);
  },
);

it("lazy SDK is single-flight, async, nonce preserving and marker-only", async () => {
  const { loadGoogleMapsSdk } = await import("./google-maps-sdk");
  const first = loadGoogleMapsSdk("fixture-only");
  expect(loadGoogleMapsSdk("fixture-only")).toBe(first);
  expect(scripts).toHaveLength(1);
  const url = new URL(scripts[0]!.src);
  expect(url.origin).toBe("https://maps.googleapis.com");
  expect(url.searchParams.get("libraries")).toBe("marker");
  expect(url.searchParams.get("loading")).toBe("async");
  expect(scripts[0]!.nonce).toBe("test-nonce");
  expect(scripts[0]!.async).toBe(true);
  host.google = { maps: { marker: {} } };
  Object.values(host.vayletGoogleMapsCallbacks!)[0]!();
  expect(await first).toBe(host.google.maps);
  expect(Object.keys(host.vayletGoogleMapsCallbacks!)).toEqual([]);
  expect(await loadGoogleMapsSdk("fixture-only")).toBe(host.google.maps);
  expect(scripts).toHaveLength(1);
});

it("does not bypass a pending callback when Google globals appear early", async () => {
  const { loadGoogleMapsSdk } = await import("./google-maps-sdk");
  const first = loadGoogleMapsSdk("fixture-only", "en");
  host.google = { maps: { marker: {} } };
  const second = loadGoogleMapsSdk("fixture-only", "ar");
  expect(second).toBe(first);
  let settled = false;
  void second.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  Object.values(host.vayletGoogleMapsCallbacks!)[0]!();
  await expect(second).resolves.toBe(host.google.maps);
  expect(settled).toBe(true);
});

it("network failure permits retry and retires old provider callbacks", async () => {
  const { loadGoogleMapsSdk } = await import("./google-maps-sdk");
  const first = loadGoogleMapsSdk("fixture-only");
  const retired = Object.values(host.vayletGoogleMapsCallbacks!)[0]!;
  const rejected = expect(first).rejects.toThrow("Map unavailable");
  scripts[0]!.onerror!();
  await rejected;
  expect(scripts[0]!.remove).toHaveBeenCalledOnce();
  const retry = loadGoogleMapsSdk("fixture-only");
  expect(scripts).toHaveLength(2);
  host.google = { maps: { marker: {} } };
  retired();
  expect(Object.keys(host.vayletGoogleMapsCallbacks!)).toHaveLength(1);
  Object.values(host.vayletGoogleMapsCallbacks!)[0]!();
  expect(await retry).toBe(host.google.maps);
});

it("timeout removes failed loader rather than leaving permanent loading", async () => {
  const { loadGoogleMapsSdk } = await import("./google-maps-sdk");
  const rejected = expect(
    loadGoogleMapsSdk("fixture-only"),
  ).rejects.toThrow("Map unavailable");
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
  expect(scripts[0]!.remove).toHaveBeenCalledOnce();
  expect(Object.keys(host.vayletGoogleMapsCallbacks!)).toEqual([]);
});

it("authorization failure reaches mounted subscribers and stays sticky", async () => {
  const { loadGoogleMapsSdk, onGoogleMapsFailure } =
    await import("./google-maps-sdk");
  const active = vi.fn();
  const retired = vi.fn();
  onGoogleMapsFailure(active);
  onGoogleMapsFailure(retired)();
  const rejected = expect(
    loadGoogleMapsSdk("fixture-only"),
  ).rejects.toThrow("Map unavailable");
  host.gm_authFailure!();
  await rejected;
  expect(active).toHaveBeenCalledOnce();
  expect(retired).not.toHaveBeenCalled();
  await expect(loadGoogleMapsSdk("fixture-only")).rejects.toThrow(
    "Map unavailable",
  );
  expect(scripts).toHaveLength(1);
});

it("owns one auth bridge across network retry and publishes once", async () => {
  const prior = vi.fn();
  host.gm_authFailure = prior;
  const { loadGoogleMapsSdk, onGoogleMapsFailure } =
    await import("./google-maps-sdk");
  const failure = vi.fn();
  onGoogleMapsFailure(failure);
  const first = loadGoogleMapsSdk("fixture-only");
  const bridge = host.gm_authFailure;
  const firstRejected = expect(first).rejects.toThrow("Map unavailable");
  scripts[0]!.onerror!();
  await firstRejected;
  const retry = loadGoogleMapsSdk("fixture-only");
  expect(host.gm_authFailure).toBe(bridge);
  const retryRejected = expect(retry).rejects.toThrow("Map unavailable");
  host.gm_authFailure!();
  await retryRejected;
  expect(failure).toHaveBeenCalledOnce();
  expect(prior).toHaveBeenCalledOnce();
});
