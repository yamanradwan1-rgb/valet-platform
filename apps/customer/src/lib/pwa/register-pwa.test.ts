import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface BrowserFixture {
  readonly document: { readyState: DocumentReadyState };
  readonly register: ReturnType<typeof vi.fn>;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
  fireLoad(): void;
}

function browserFixture(readyState: DocumentReadyState): BrowserFixture {
  const listeners = new Set<() => void>();
  const register = vi.fn(async () => ({ scope: "/" }));
  const addEventListener = vi.fn((event: string, callback: () => void) => {
    if (event === "load") listeners.add(callback);
  });
  const removeEventListener = vi.fn((event: string, callback: () => void) => {
    if (event === "load") listeners.delete(callback);
  });
  const document = { readyState };
  vi.stubGlobal("window", {
    isSecureContext: true,
    addEventListener,
    removeEventListener,
  });
  vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", { serviceWorker: { register } });

  return {
    document,
    register,
    addEventListener,
    removeEventListener,
    fireLoad() {
      for (const callback of [...listeners]) {
        listeners.delete(callback);
        callback();
      }
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Customer PWA service worker registration", () => {
  it("registers a shared non-caching development worker without waiting for readiness", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const browser = browserFixture("complete");
    const { registerServiceWorker } = await import("./register-pwa");
    registerServiceWorker();
    registerServiceWorker();
    expect(browser.register).toHaveBeenCalledExactlyOnceWith(
      "/sw.js?development=1",
    );
  });

  it("registers once immediately when initialized after window load", async () => {
    const browser = browserFixture("complete");
    const { registerServiceWorker } = await import("./register-pwa");

    registerServiceWorker();
    registerServiceWorker();
    await Promise.resolve();
    registerServiceWorker();

    expect(browser.register).toHaveBeenCalledExactlyOnceWith("/sw.js");
    expect(browser.addEventListener).not.toHaveBeenCalled();
  });

  it.each(["loading", "interactive"] as const)(
    "registers on load for a %s document with one shared listener",
    async (readyState) => {
      const browser = browserFixture(readyState);
      const { registerServiceWorker } = await import("./register-pwa");

      registerServiceWorker();
      registerServiceWorker();
      expect(browser.register).not.toHaveBeenCalled();
      expect(browser.addEventListener).toHaveBeenCalledExactlyOnceWith(
        "load",
        expect.any(Function),
        { once: true },
      );

      browser.fireLoad();
      browser.fireLoad();
      registerServiceWorker();
      expect(browser.register).toHaveBeenCalledExactlyOnceWith("/sw.js");
    },
  );

  it("recovers when document becomes complete before the queued load callback runs", async () => {
    const browser = browserFixture("loading");
    const { registerServiceWorker } = await import("./register-pwa");

    registerServiceWorker();
    browser.document.readyState = "complete";
    registerServiceWorker();
    browser.fireLoad();

    expect(browser.removeEventListener).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
    );
    expect(browser.register).toHaveBeenCalledExactlyOnceWith("/sw.js");
  });

  it("reuses an in-flight registration without waiting for service worker activation", async () => {
    const browser = browserFixture("complete");
    let resolveRegistration!: (value: ServiceWorkerRegistration) => void;
    browser.register.mockImplementation(
      () =>
        new Promise<ServiceWorkerRegistration>((resolve) => {
          resolveRegistration = resolve;
        }),
    );
    vi.stubGlobal("navigator", {
      serviceWorker: {
        register: browser.register,
        get ready() {
          throw new Error("Must not wait for activation");
        },
      },
    });
    const { registerServiceWorker } = await import("./register-pwa");

    registerServiceWorker();
    registerServiceWorker();
    expect(browser.register).toHaveBeenCalledTimes(1);
    resolveRegistration({ scope: "/" } as ServiceWorkerRegistration);
    await Promise.resolve();
    registerServiceWorker();
    expect(browser.register).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected registration and retries on later initialization", async () => {
    const browser = browserFixture("complete");
    browser.register.mockRejectedValueOnce(new Error("Network error"));
    const { registerServiceWorker } = await import("./register-pwa");

    registerServiceWorker();
    registerServiceWorker();
    expect(browser.register).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    registerServiceWorker();
    expect(browser.register).toHaveBeenCalledTimes(2);
  });

  it("swallows a synchronous registration failure and permits retry", async () => {
    const browser = browserFixture("complete");
    browser.register.mockImplementationOnce(() => {
      throw new Error("Blocked");
    });
    const { registerServiceWorker } = await import("./register-pwa");

    expect(() => registerServiceWorker()).not.toThrow();
    registerServiceWorker();
    expect(browser.register).toHaveBeenCalledTimes(2);
  });

  it("does nothing in test, insecure contexts or without compatible browser APIs", async () => {
    const browser = browserFixture("complete");
    const { registerServiceWorker } = await import("./register-pwa");

    vi.stubEnv("NODE_ENV", "test");
    registerServiceWorker();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("window", { isSecureContext: false });
    registerServiceWorker();
    vi.stubGlobal("navigator", {});
    registerServiceWorker();
    vi.stubGlobal("navigator", { serviceWorker: {} });
    registerServiceWorker();
    vi.stubGlobal("window", undefined);
    registerServiceWorker();

    expect(browser.register).not.toHaveBeenCalled();
    expect(browser.addEventListener).not.toHaveBeenCalled();
  });
});
