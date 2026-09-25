import type { Page } from "@playwright/test";

export async function persistentMatches(page: Page, needle: string) {
  return await page.evaluate(async (sentinel) => {
    const storageMatches = (storage: Storage) =>
      Object.entries(storage)
        .filter(([, value]) => value.includes(sentinel))
        .map(([key]) => key);
    const indexedMatches: string[] = [];
    if (typeof indexedDB.databases === "function") {
      for (const info of await indexedDB.databases()) {
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
              let serialized = "";
              try {
                serialized = typeof value === "string" ? value : JSON.stringify(value) ?? "";
              } catch {
                serialized = String(value);
              }
              if (serialized.includes(sentinel)) indexedMatches.push(`${info.name}:${storeName}`);
            }
          }
        } finally {
          database.close();
        }
      }
    }
    const cacheMatches: string[] = [];
    if ("caches" in window) {
      for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          if (response && (await response.clone().text()).includes(sentinel)) {
            cacheMatches.push(`${cacheName}:${request.url}`);
          }
        }
      }
    }
    return {
      local: storageMatches(localStorage),
      session: storageMatches(sessionStorage),
      indexed: indexedMatches,
      cache: cacheMatches,
    };
  }, needle);
}
