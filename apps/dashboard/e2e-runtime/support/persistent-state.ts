import { expect, type Page } from "@playwright/test";

export async function installObjectUrlProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    const state = window as unknown as {
      __md06ObjectUrls: string[];
      __md06ObjectUrlHistory: string[];
      __md06ObjectUrlRevokes: number;
    };
    state.__md06ObjectUrls = [];
    state.__md06ObjectUrlHistory = [];
    state.__md06ObjectUrlRevokes = 0;
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      state.__md06ObjectUrls.push(url);
      state.__md06ObjectUrlHistory.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      state.__md06ObjectUrlRevokes += 1;
      state.__md06ObjectUrls = state.__md06ObjectUrls.filter(
        (candidate) => candidate !== url,
      );
      revoke(url);
    };
  });
}

export async function objectUrlHistory(page: Page): Promise<string[]> {
  const state = await page.evaluate(() => {
    const runtime = window as unknown as {
      __md06ObjectUrls: string[];
      __md06ObjectUrlHistory: string[];
      __md06ObjectUrlRevokes: number;
    };
    return {
      active: runtime.__md06ObjectUrls,
      history: runtime.__md06ObjectUrlHistory,
      revokes: runtime.__md06ObjectUrlRevokes,
    };
  });
  expect(state.active).toEqual([]);
  expect(state.revokes).toBe(state.history.length);
  return state.history;
}

export async function persistentState(page: Page, needles: readonly string[]) {
  return page.evaluate(async (searchNeedles) => {
    if (typeof indexedDB.databases !== "function") {
      throw new Error("IndexedDB enumeration is unavailable.");
    }
    if (!("caches" in window)) throw new Error("CacheStorage is unavailable.");
    const matches = Object.fromEntries(searchNeedles.map((needle) => [needle, [] as string[]]));
    const inspect = (where: string, text: string) => {
      for (const needle of searchNeedles) {
        if (text.includes(needle)) matches[needle]!.push(where);
      }
    };
    for (const [key, value] of Object.entries(localStorage)) {
      inspect(`localStorage:${key}`, value);
    }
    for (const [key, value] of Object.entries(sessionStorage)) {
      inspect(`sessionStorage:${key}`, value);
    }

    const databaseInfo = await indexedDB.databases();
    const databases = databaseInfo.map((db) => `${db.name ?? ""}:${db.version ?? ""}`).sort();
    for (const info of databaseInfo) {
      if (!info.name) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        for (const storeName of Array.from(database.objectStoreNames)) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const transaction = database.transaction(storeName, "readonly");
            const request = transaction.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          for (const value of values) {
            const text = value instanceof Blob
              ? await value.text()
              : JSON.stringify(value) ?? String(value);
            inspect(`indexedDB:${info.name}:${storeName}`, text);
          }
        }
      } finally {
        database.close();
      }
    }

    const cacheEntries: string[] = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        cacheEntries.push(`${cacheName}:${request.url}`);
        inspect(`cache-url:${cacheName}`, request.url);
        const response = await cache.match(request);
        if (response) inspect(`cache-body:${cacheName}`, await response.clone().text());
      }
    }
    return { cacheEntries: cacheEntries.sort(), databases, matches };
  }, needles);
}
