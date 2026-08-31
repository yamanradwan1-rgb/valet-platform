import type { CustomerPushStorage } from "./customer-push-manager";

const STORAGE_KEY = "vaylet.customer.web-push.binding-id.v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BrowserCustomerPushStorage implements CustomerPushStorage {
  constructor(private readonly storage: Storage | null) {}

  clear(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Optional convergence hint only.
    }
  }

  read(): string | null {
    try {
      const value = this.storage?.getItem(STORAGE_KEY) ?? null;
      if (!value || UUID_PATTERN.test(value)) return value;
      this.clear();
    } catch {
      // Storage is optional.
    }
    return null;
  }

  write(id: string): void {
    if (!UUID_PATTERN.test(id))
      throw new Error("Invalid push binding identity.");
    try {
      this.storage?.setItem(STORAGE_KEY, id);
    } catch {
      // Storage is optional.
    }
  }
}

export function createBrowserCustomerPushStorage(): BrowserCustomerPushStorage {
  try {
    return new BrowserCustomerPushStorage(window.localStorage);
  } catch {
    return new BrowserCustomerPushStorage(null);
  }
}
