import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const worker = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);

describe("development Guest worker", () => {
  it("claims clients without reading, migrating or deleting any caches and never intercepts HMR", async () => {
    const handlers: Record<string, (event: Record<string, unknown>) => void> =
      {};
    const caches = {
      keys: vi.fn(async () => []),
      open: vi.fn(),
      delete: vi.fn(),
    };
    const claim = vi.fn(async () => undefined);
    const skipWaiting = vi.fn(async () => undefined);
    const showNotification = vi.fn(async () => undefined);
    const openWindow = vi.fn(async () => undefined);
    runInNewContext(worker, {
      self: {
        location: {
          origin: "https://qa.example.test",
          search: "?development=1",
        },
        clients: { claim, matchAll: async () => [], openWindow },
        registration: { showNotification },
        skipWaiting,
        addEventListener: (
          name: string,
          handler: (typeof handlers)[string],
        ) => {
          handlers[name] = handler;
        },
      },
      caches,
      URL,
      Set,
      Object,
      Promise,
    });
    for (const name of ["install", "activate"]) {
      let pending: Promise<unknown> | undefined;
      handlers[name]!({
        waitUntil: (value: Promise<unknown>) => {
          pending = value;
        },
      });
      await pending;
    }
    expect(claim).toHaveBeenCalledTimes(1);
    expect(skipWaiting).toHaveBeenCalledTimes(1);
    expect(caches.keys).not.toHaveBeenCalled();
    expect(caches.open).not.toHaveBeenCalled();
    expect(caches.delete).not.toHaveBeenCalled();
    for (const path of [
      "/_next/static/chunks/app.js",
      "/_next/webpack-hmr",
      "/manifest.webmanifest",
      "/api/v1/guest/session",
    ]) {
      const respondWith = vi.fn();
      handlers.fetch!({
        request: new Request(`https://qa.example.test${path}`),
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
    let push: Promise<unknown> | undefined;
    handlers.push!({
      data: {
        json: () => ({
          schemaVersion: 1,
          kind: "GUEST_VEHICLE_READY",
          routeIntent: "GUEST_STATUS",
          intentId: "a4f01d68-b8de-4d67-a389-775704ef3250",
          locale: "ar",
        }),
      },
      waitUntil: (value: Promise<unknown>) => {
        push = value;
      },
    });
    await push;
    expect(showNotification).toHaveBeenCalledWith(
      "سيارتك جاهزة",
      expect.objectContaining({ data: { routeIntent: "GUEST_STATUS" } }),
    );
    let click: Promise<unknown> | undefined;
    handlers.notificationclick!({
      notification: { close: vi.fn(), data: { routeIntent: "GUEST_STATUS" } },
      waitUntil: (value: Promise<unknown>) => {
        click = value;
      },
    });
    await click;
    expect(openWindow).toHaveBeenCalledExactlyOnceWith("/");
  });
});
