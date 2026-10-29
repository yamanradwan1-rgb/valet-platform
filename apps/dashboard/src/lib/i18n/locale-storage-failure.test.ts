import { afterEach, describe, expect, it } from "vitest";

import {
  commitDashboardLocale,
  DASHBOARD_LOCALE_EVENT,
  DASHBOARD_LOCALE_STORAGE_KEY,
  directionForLocale,
  readDashboardLocale,
  reconcileDashboardLocaleStorage,
} from "./locale";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

function installBrowser(mode: "writable" | "read-denied" | "write-denied") {
  const storage = new Map<string, string>();
  const events: string[] = [];
  const root = { lang: "en", dir: "ltr" };
  const store = {
    getItem(key: string) {
      if (mode === "read-denied") throw new Error("storage read denied");
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (mode !== "writable") throw new Error("storage write denied");
      storage.set(key, value);
    },
    removeItem(key: string) { storage.delete(key); },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: store,
      dispatchEvent(event: Event) { events.push(event.type); },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: root },
  });
  return { storage, events, root };
}

afterEach(() => {
  for (const [name, descriptor] of [
    ["window", previousWindow],
    ["document", previousDocument],
  ] as const) {
    if (descriptor === undefined) delete (globalThis as Record<string, unknown>)[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
});

describe("Dashboard locale snapshot with unreliable storage", () => {
  it.each(["read-denied", "write-denied"] as const)(
    "keeps both locale and document direction coherent when %s",
    (mode) => {
      const browser = installBrowser(mode);
      commitDashboardLocale("en");
      commitDashboardLocale("ar");
      expect(readDashboardLocale()).toBe("ar");
      expect(directionForLocale(readDashboardLocale())).toBe("rtl");
      expect(browser.root).toEqual({ lang: "ar", dir: "rtl" });
      expect(browser.events).toContain(DASHBOARD_LOCALE_EVENT);
      commitDashboardLocale("en");
      expect(readDashboardLocale()).toBe("en");
      expect(browser.root).toEqual({ lang: "en", dir: "ltr" });
      expect(browser.storage.has(DASHBOARD_LOCALE_STORAGE_KEY)).toBe(false);
    },
  );

  it("uses persisted locale and accepts normal EN→AR→EN transitions", () => {
    const browser = installBrowser("writable");
    commitDashboardLocale("en");
    browser.storage.set(DASHBOARD_LOCALE_STORAGE_KEY, "ar");
    expect(readDashboardLocale()).toBe("ar");
    commitDashboardLocale("en");
    expect(readDashboardLocale()).toBe("en");
    commitDashboardLocale("ar");
    expect(browser.storage.get(DASHBOARD_LOCALE_STORAGE_KEY)).toBe("ar");
    expect(readDashboardLocale()).toBe("ar");
  });

  it("accepts relevant cross-tab locale changes even after a local write failure", () => {
    installBrowser("write-denied");
    commitDashboardLocale("ar");
    expect(readDashboardLocale()).toBe("ar");
    reconcileDashboardLocaleStorage({
      key: DASHBOARD_LOCALE_STORAGE_KEY,
      newValue: "en",
    } as StorageEvent);
    expect(readDashboardLocale()).toBe("en");
  });

  it("ignores unrelated storage events and handles clearing a locale in another tab", () => {
    installBrowser("read-denied");
    commitDashboardLocale("ar");
    reconcileDashboardLocaleStorage({ key: "other", newValue: "en" } as StorageEvent);
    expect(readDashboardLocale()).toBe("ar");
    reconcileDashboardLocaleStorage({ key: null, newValue: null } as StorageEvent);
    expect(readDashboardLocale()).toBe("en");
  });
});
