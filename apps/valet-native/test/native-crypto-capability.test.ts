import { describe, expect, it, vi } from "vitest";
import { NativePinnedDiagnostics } from "../src/telemetry/native-pinned-diagnostics";
import { probeNativeCryptoCapability } from "../src/telemetry/native-crypto-capability";

function inspect(value: unknown) {
  const pinned = new NativePinnedDiagnostics();
  probeNativeCryptoCapability(pinned, value);
  return pinned.snapshot().crypto.lastCompleted;
}

describe("Native CSPRNG availability probe", () => {
  it("classifies a missing Crypto object without generating insecure IDs", () => {
    expect(inspect(undefined)).toMatchObject({
      status: "failed", firstFailedStage: "crypto-object",
      stages: [{ stage: "crypto-object", outcome: "missing" }],
    });
  });

  it("distinguishes missing, throwing and invalid randomUUID", () => {
    const base = { getRandomValues: (bytes: Uint8Array) => bytes };
    expect(inspect(base)?.stages).toContainEqual({
      stage: "random-uuid", outcome: "missing",
    });
    expect(inspect({ ...base, randomUUID: () => { throw Error("PRIVATE_TOKEN"); } })
      ?.stages).toContainEqual({ stage: "random-uuid", outcome: "error" });
    expect(inspect({ ...base, randomUUID: () => "PRIVATE_TOKEN" })
      ?.stages).toContainEqual({ stage: "random-uuid", outcome: "error" });
  });

  it("distinguishes throwing getRandomValues and validates UUIDv8 output", () => {
    const throwing = inspect({ getRandomValues: () => {
      throw Error("SECRET");
    }, randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" });
    expect(throwing?.stages).toContainEqual({
      stage: "get-random-values", outcome: "error",
    });
    const secureCompatible = inspect({
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i += 1) array[i] = i + 1;
        return array;
      },
      randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(secureCompatible?.status).toBe("success");
    expect(secureCompatible?.stages).toContainEqual({
      stage: "uuid-v8-validation", outcome: "success",
    });
    expect(JSON.stringify(secureCompatible)).not.toContain("550e8400");
    expect(JSON.stringify(throwing)).not.toContain("SECRET");
  });

  it("succeeds with native provider even when physical Android global Crypto is absent", () => {
    vi.stubGlobal("crypto", undefined);
    try {
      const native = inspect({
        getRandomValues: (bytes: Uint8Array) => {
          bytes.set(Uint8Array.from({ length: bytes.length }, (_, i) => i));
          return bytes;
        },
        randomUUID: () => "12345678-1234-4123-8123-123456789abc",
      });
      expect(native?.status).toBe("success");
      expect(native?.firstFailedStage).toBeNull();
      expect(native?.stages).toContainEqual({ stage: "random-uuid", outcome: "success" });
    } finally { vi.unstubAllGlobals(); }
  });

  it("never claims Crypto ready when provider rejects the adapter's same-array contract", () => {
    const mismatch = inspect({
      getRandomValues: () => new Uint8Array(16),
      randomUUID: () => "12345678-1234-4123-8123-123456789abc",
    });
    expect(mismatch).toMatchObject({
      status: "failed", firstFailedStage: "get-random-values",
    });
    expect(mismatch?.stages).toContainEqual({
      stage: "uuid-v8-validation", outcome: "missing",
    });
  });
});
