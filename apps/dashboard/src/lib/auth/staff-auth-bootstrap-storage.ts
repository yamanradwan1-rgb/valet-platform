export function hasPersistedLogoutMarker(markerKey: string): boolean {
  try {
    return globalThis.localStorage?.getItem(markerKey) === "1";
  } catch {
    return false;
  }
}

/** Whether a fresh browser runtime can safely rely on its logout marker. */
export function canRestoreStaffCookieSession(markerKey: string): boolean {
  // Server-side and Node test clients have no browser cookie to restore.
  if (typeof window === "undefined" && !("localStorage" in globalThis)) return true;

  let storage: Storage | undefined;
  let probeKey: string | undefined;
  let reliable = false;
  try {
    storage = globalThis.localStorage;
    if (storage === undefined || storage.getItem(markerKey) === "1") return false;

    probeKey = `vaylet_staff_storage_probe_${Math.random().toString(36).slice(2)}`;
    storage.setItem(probeKey, "1");
    reliable = storage.getItem(probeKey) === "1";
  } catch {
    return false;
  } finally {
    if (storage !== undefined && probeKey !== undefined) {
      try {
        storage.removeItem(probeKey);
        if (storage.getItem(probeKey) !== null) reliable = false;
      } catch {
        reliable = false;
      }
    }
  }
  return reliable;
}
