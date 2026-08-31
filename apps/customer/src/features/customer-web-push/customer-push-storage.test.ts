import { describe, expect, it, vi } from "vitest";

import { BrowserCustomerPushStorage } from "./customer-push-storage";

const ID = "11111111-1111-4111-8111-111111111111";

describe("Customer push local persistence", () => {
  it("persists only a validated server binding UUID as a non-authoritative hint", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => values.delete(key)),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    } as unknown as Storage;
    const subject = new BrowserCustomerPushStorage(storage);
    subject.write(ID);
    expect(subject.read()).toBe(ID);
    expect([...values.values()]).toEqual([ID]);
    expect(JSON.stringify([...values])).not.toMatch(
      /guestToken|generation|endpoint|p256dh|auth/i,
    );
  });

  it("clears malformed metadata without exposing it as authority", () => {
    const storage = {
      getItem: vi.fn(() => "not-a-binding-id"),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    } as unknown as Storage;
    const subject = new BrowserCustomerPushStorage(storage);
    expect(subject.read()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledOnce();
  });
});
