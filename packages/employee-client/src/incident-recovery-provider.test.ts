import { afterEach, describe, expect, it, vi } from "vitest";
import { incidentRecoveryIdSchema } from "@valet/contracts";
import { createIncidentRecoveryId } from "./incident-recovery-id";
import { IncidentRecoveryState } from "./incident-recovery-state";
import type { IncidentRecoveryStore, IncidentRecoveryTransport } from "./incident-recovery-types";

afterEach(() => vi.unstubAllGlobals());

describe("Issue #302: secure UUIDv8 provider boundary", () => {
  it("reproduces the physical missing Crypto object without an insecure fallback", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => createIncidentRecoveryId()).toThrow("Secure UUID generation is unavailable.");
  });

  it("fails closed on a missing provider function or a native provider exception", () => {
    expect(() => createIncidentRecoveryId({} as never)).toThrow();
    expect(() => createIncidentRecoveryId({
      getRandomValues() { throw new Error("native entropy unavailable"); },
    })).toThrow("native entropy unavailable");
  });

  it("preserves 122 random bits and sets precisely the RFC 9562 version/variant", () => {
    const random = Uint8Array.from({ length: 16 }, (_, index) => 0xf0 | index);
    const result = createIncidentRecoveryId({
      getRandomValues(bytes) { bytes.set(random); return bytes; },
    });
    expect(incidentRecoveryIdSchema.parse(result)).toBe(result);
    const originalHex = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const createdHex = result.replace(/-/g, "");
    for (let position = 0; position < originalHex.length; position += 1) {
      if (position === 12) expect(createdHex[position]).toBe("8");
      else if (position === 16) expect("89ab").toContain(createdHex[position]);
      else expect(createdHex[position]).toBe(originalHex[position]);
    }
  });

  it("never writes the recovery marker or reserves an Incident when entropy fails", async () => {
    vi.stubGlobal("crypto", undefined);
    const store: IncidentRecoveryStore = {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn(), delete: vi.fn(),
    };
    const transport: IncidentRecoveryTransport = {
      read: vi.fn(), reserve: vi.fn(), retire: vi.fn(),
    };
    const observe = vi.fn();
    const state = new IncidentRecoveryState(store, transport, createIncidentRecoveryId,
      Date.now, observe);
    await expect(state.prepare({
      installationGeneration: "test-only-installation",
      locationId: "018f1234-5678-4abc-a234-56789abcdef1",
      membershipId: "018f1234-5678-4abc-a234-56789abcdef2",
      organizationId: "018f1234-5678-4abc-a234-56789abcdef3",
    }, "018f1234-5678-4abc-a234-56789abcdef4")).rejects.toThrow();
    expect(store.write).not.toHaveBeenCalled();
    expect(transport.reserve).not.toHaveBeenCalled();
    expect(transport.read).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith({ stage: "secure-uuid", outcome: "error" });
  });
});
