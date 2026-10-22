import { describe, expect, it } from "vitest";
import { RatingPresentationPolicy } from "./rating-presentation-policy";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("#312 exact-context rating presentation", () => {
  it("allows one pending attempt despite duplicate effects and completed observations", () => {
    const policy = new RatingPresentationPolicy(null, null);
    expect(policy.state).toBe("unprompted");
    expect(policy.begin()).toBe(true);
    expect(policy.begin()).toBe(false);
    policy.opened();
    expect(policy.state).toBe("opened");
    expect(policy.begin()).toBe(false);
  });

  it("persists intentional dismissal across refresh for only the exact context/visit", () => {
    const store = storage();
    const a = new RatingPresentationPolicy(store, "context-a:visit-a");
    a.begin();
    a.dismiss();
    expect(
      new RatingPresentationPolicy(store, "context-a:visit-a").begin(),
    ).toBe(false);
    expect(
      new RatingPresentationPolicy(store, "context-a:visit-b").begin(),
    ).toBe(true);
    expect(
      new RatingPresentationPolicy(store, "context-b:visit-a").begin(),
    ).toBe(true);
  });

  it.each(["saved", "conflict", "unknown"] as const)(
    "suppresses automatic entry after %s without resubmitting",
    (value) => {
      const store = storage();
      const policy = new RatingPresentationPolicy(store, "scope");
      policy.begin();
      policy.outcome(value);
      expect(policy.state).toBe(
        value === "unknown" ? "dismissed" : "submitted",
      );
      expect(new RatingPresentationPolicy(store, "scope").begin()).toBe(false);
    },
  );

  it("invalidates stale pending callbacks", () => {
    const policy = new RatingPresentationPolicy(null, null);
    policy.begin();
    policy.invalidate();
    policy.opened();
    policy.outcome("saved");
    expect(policy.state).toBe("invalidated");
    expect(policy.begin()).toBe(false);
  });

  it("does not treat transient failures as successful submission", () => {
    const policy = new RatingPresentationPolicy(null, null);
    policy.begin();
    policy.outcome("failed");
    expect(policy.state).toBe("pending");
  });

  it("survives unavailable browser storage and suppresses repeats in memory", () => {
    const denied = {
      getItem() {
        throw Error("denied");
      },
      setItem() {
        throw Error("denied");
      },
    };
    const policy = new RatingPresentationPolicy(denied, "scope");
    expect(policy.begin()).toBe(true);
    policy.dismiss();
    expect(policy.begin()).toBe(false);
  });

  it("ignores invalid persisted presentation state", () => {
    const store = storage();
    store.setItem("scope", "authorized");
    expect(new RatingPresentationPolicy(store, "scope").begin()).toBe(true);
  });
});
