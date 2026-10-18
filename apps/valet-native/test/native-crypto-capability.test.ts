import { describe, expect, it } from "vitest";
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
});
