import { afterEach, describe, expect, it, vi } from "vitest";
import { guestPresentationContext } from "./guest-presentation-context";

afterEach(() => vi.unstubAllGlobals());
describe("credential-free Browser Session presentation namespace", () => {
  it("survives restore, rotates on fresh exchange and stores only a random nonce", () => {
    const values = new Map<string, string>();
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce("random-1")
      .mockReturnValueOnce("random-2");
    vi.stubGlobal("window", {
      crypto: { randomUUID },
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    expect(guestPresentationContext()).toBe("random-1");
    expect(guestPresentationContext()).toBe("random-1");
    expect(guestPresentationContext(true)).toBe("random-2");
    expect(guestPresentationContext()).toBe("random-2");
    expect([...values.values()]).toEqual(["random-2"]);
  });
  it("tolerates denied storage without granting authority", () => {
    vi.stubGlobal("window", {
      get sessionStorage() {
        throw Error("denied");
      },
    });
    expect(guestPresentationContext()).toBeNull();
  });
});
