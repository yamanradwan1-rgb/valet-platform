import { describe, expect, it } from "vitest";

import { resolveAlertsPrototypeRoute } from "./prototype-route-gate";

describe("management alerts prototype route gate", () => {
  it("activates only for the exact alerts query outside production", () => {
    expect(resolveAlertsPrototypeRoute("development", "alerts", "b")).toEqual({
      enabled: true,
      variant: "b",
    });
    expect(resolveAlertsPrototypeRoute("test", "alerts", "a").enabled).toBe(true);
    expect(resolveAlertsPrototypeRoute("production", "alerts", "b").enabled).toBe(false);
    expect(resolveAlertsPrototypeRoute("development", "other", "b").enabled).toBe(false);
    expect(resolveAlertsPrototypeRoute("development", ["alerts"], "b").enabled).toBe(false);
  });

  it("defaults unknown variants to A", () => {
    expect(resolveAlertsPrototypeRoute("development", "alerts", undefined).variant).toBe("a");
    expect(resolveAlertsPrototypeRoute("development", "alerts", "unknown").variant).toBe("a");
  });
});
