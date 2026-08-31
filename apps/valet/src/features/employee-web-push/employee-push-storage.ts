import type { EmployeePushStorage } from "./employee-push-manager";

const STORAGE_KEY = "vaylet.employee.web-push.binding-id.v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BrowserEmployeePushStorage implements EmployeePushStorage {
  constructor(private readonly storage: Storage | null) {}

  public clear(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be disabled; push remains optional.
    }
  }

  public read(): string | null {
    let value: string | null = null;
    try {
      value = this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
    if (!value || !UUID_PATTERN.test(value)) {
      if (value) this.clear();
      return null;
    }
    return value;
  }

  public write(id: string): void {
    if (!UUID_PATTERN.test(id))
      throw new Error("Invalid push binding identity.");
    try {
      this.storage?.setItem(STORAGE_KEY, id);
    } catch {
      // Browser persistence is an optional convergence hint only.
    }
  }
}

export function createBrowserEmployeePushStorage(): BrowserEmployeePushStorage {
  try {
    return new BrowserEmployeePushStorage(window.localStorage);
  } catch {
    return new BrowserEmployeePushStorage(null);
  }
}
