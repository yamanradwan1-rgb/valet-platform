import { describe, expect, it, vi } from "vitest";
import { PlateOcrCostGuard } from "../src/modules/check-in-api/plate-ocr-cost-guard";

const identity = {
  organizationId: "org",
  membershipId: "member",
  targetLocationId: "location",
};
function setup(mode = "test", capacity = 1024) {
  let time = 0;
  const guard = new PlateOcrCostGuard(mode, () => time, capacity);
  const provider = vi.fn();
  const call = (key = identity) => {
    const release = guard.acquire(key);
    if (release) {
      provider();
      release();
    }
    return release !== undefined;
  };
  return {
    guard,
    call,
    provider,
    at: (value: number) => {
      time = value;
    },
  };
}
describe("DEC-074 non-production cost guard", () => {
  it("allows first and denies concurrent calls before I/O", () => {
    const c = setup();
    const release = c.guard.acquire(identity)!;
    c.provider();
    expect(c.call()).toBe(false);
    expect(c.provider).toHaveBeenCalledOnce();
    release();
    expect(c.call()).toBe(true);
  });
  it("allows five in 10 seconds, denies sixth and re-allows on expiry", () => {
    const c = setup();
    for (let i = 0; i < 5; i++) expect(c.call()).toBe(true);
    c.at(9999);
    expect(c.call()).toBe(false);
    expect(c.provider).toHaveBeenCalledTimes(5);
    c.at(10000);
    expect(c.call()).toBe(true);
  });
  it("allows twenty subject to bursts; denies 21st until 60-second expiry", () => {
    const c = setup();
    for (let burst = 0; burst < 4; burst++) {
      c.at(burst * 10000);
      for (let i = 0; i < 5; i++) expect(c.call()).toBe(true);
    }
    c.at(59999);
    expect(c.call()).toBe(false);
    expect(c.provider).toHaveBeenCalledTimes(20);
    c.at(60000);
    expect(c.call()).toBe(true);
  });
  it.each(["organizationId", "membershipId", "targetLocationId"])(
    "isolates %s",
    (field) => {
      const c = setup();
      for (let i = 0; i < 5; i++) c.call();
      expect(c.call({ ...identity, [field]: "other" })).toBe(true);
      expect(c.call()).toBe(false);
    },
  );
  it("bounds keys, expires idle state, but never evicts an in-flight key", () => {
    const c = setup("test", 1);
    const release = c.guard.acquire(identity)!;
    const other = { ...identity, membershipId: "other" };
    c.at(60001);
    expect(c.call(other)).toBe(false);
    release();
    expect(c.call(other)).toBe(true);
    expect(c.call()).toBe(false);
    c.at(120002);
    expect(c.call()).toBe(true);
  });
  it.each(["production", "staging", ""])(
    "fails closed in %s without provider calls",
    (mode) => {
      const c = setup(mode);
      expect(c.call()).toBe(false);
      expect(c.provider).not.toHaveBeenCalled();
    },
  );
});
