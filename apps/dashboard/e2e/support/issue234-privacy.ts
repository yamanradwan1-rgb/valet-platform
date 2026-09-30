import type { Page } from "@playwright/test";

export async function hasPersistentSensitiveMatch(
  page: Page,
  sentinels: readonly string[],
): Promise<boolean> {
  const browserMatch = await page.evaluate(async (needles) => {
    const matches = (value: unknown) => {
      let text = "";
      try {
        text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
      } catch {
        text = String(value);
      }
      return needles.some((needle) => text.includes(needle));
    };
    const storageMatches = (storage: Storage) => {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && (matches(key) || matches(storage.getItem(key)))) return true;
      }
      return false;
    };
    if (storageMatches(localStorage) || storageMatches(sessionStorage)) return true;

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
            const transaction = database.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const [keys, values] = await Promise.all([
              new Promise<IDBValidKey[]>((resolve, reject) => {
                const request = store.getAllKeys();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              }),
              new Promise<unknown[]>((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              }),
            ]);
            if (keys.some(matches) || values.some(matches)) return true;
          }
        } finally {
          database.close();
        }
      }
    }

    if ("caches" in window) {
      for (const cacheName of await caches.keys()) {
        if (matches(cacheName)) return true;
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) {
          if (matches(request.url)) return true;
          const response = await cache.match(request);
          if (response && matches(await response.clone().text())) return true;
        }
      }
    }
    return false;
  }, [...sentinels]);
  if (browserMatch) return true;

  const cookies = await page.context().cookies();
  return cookies.some((cookie) =>
    sentinels.some(
      (sentinel) => cookie.name.includes(sentinel) || cookie.value.includes(sentinel),
    ),
  );
}

export async function domHasSensitiveMatch(
  page: Page,
  sentinels: readonly string[],
): Promise<boolean> {
  const html = await page.locator("html").innerHTML();
  return sentinels.some((sentinel) => html.includes(sentinel));
}
