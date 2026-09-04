import { describe, expect, it } from "vitest";
import { QrCaptureSession } from "./qr-capture-session";

const qr = "vaylet:key-slot:K-01";
function scanning() {
  const session = new QrCaptureSession("key-slot");
  const generation = session.begin()!;
  session.permission(generation, true);
  session.ready(generation);
  return { session, generation };
}

describe("portable capture generations", () => {
  it("starts closed and opens a fresh generation explicitly", () => {
    const session = new QrCaptureSession("key-slot");
    expect(session.current().phase).toBe("idle");
    expect(session.input()).toBeNull();
    expect(session.begin()).toBe(1);
    expect(session.begin()).toBeNull();
  });
  it("deduplicates consecutive invalid frames but accepts valid next frame", () => {
    const { session, generation } = scanning();
    session.decode(generation, "wrong");
    const rejected = session.current();
    session.decode(generation, "wrong");
    expect(session.current()).toBe(rejected);
    expect(session.current().phase).toBe("scanning");
    session.decode(generation, "different");
    expect(session.current().rejectionCount).toBe(2);
    expect(session.decode(generation, qr)).toBe(true);
    expect(session.current().rejection).toBeNull();
  });
  it("locks synchronously before a same/different callback burst or UI render", () => {
    const { session, generation } = scanning();
    const accepted = [qr, qr, "vaylet:key-slot:other"].map((text) =>
      session.decode(generation, text),
    );
    expect(accepted).toEqual([true, false, false]);
    expect(session.input()).toEqual({ kind: "key-slot", resourceCode: "K-01" });
    expect(session.decode(session.current().generation, qr)).toBe(false);
    expect(session.current().phase).toBe("accepted");
  });
  it("requires explicit rearm and does not rearm on snapshot reads", () => {
    const { session, generation } = scanning();
    session.decode(generation, qr);
    session.current();
    session.toJSON();
    expect(session.decode(generation, qr)).toBe(false);
    const next = session.begin()!;
    expect(next).toBeGreaterThan(generation);
    expect(session.input()).toBeNull();
    session.permission(next, true);
    expect(session.decode(next, qr)).toBe(true);
  });
  it.each(["permission", "startup", "decode"])(
    "fences late %s after close/replacement",
    (callback) => {
      const { session, generation } = scanning();
      session.close();
      session.close();
      if (callback === "permission") session.permission(generation, true);
      if (callback === "startup") session.ready(generation);
      if (callback === "decode") session.decode(generation, qr);
      expect(session.current().phase).toBe("idle");
      expect(session.input()).toBeNull();
      session.begin();
      session.decode(generation, qr);
      expect(session.current().phase).toBe("requesting");
    },
  );
  it.each(["denied", "unavailable", "error"] as const)(
    "releases capture on %s without storing raw errors",
    (failure) => {
      const { session, generation } = scanning();
      session.fail(generation, failure);
      session.decode(generation, qr);
      session.ready(generation);
      expect(session.current().phase).toBe(failure);
      expect(session.input()).toBeNull();
    },
  );
  it("holds Dynamic proof privately in memory and clears it on exit", () => {
    const session = new QrCaptureSession("dynamic-handoff");
    const generation = session.begin()!;
    session.permission(generation, true);
    const proof = `vhq1.${"A".repeat(43)}`;
    session.decode(generation, proof);
    expect(session.input()).toEqual({ kind: "dynamic-handoff", proof });
    expect(JSON.stringify(session)).not.toContain(proof);
    expect(JSON.stringify(session.current())).not.toContain(proof);
    session.close();
    expect(session.input()).toBeNull();
  });
});
