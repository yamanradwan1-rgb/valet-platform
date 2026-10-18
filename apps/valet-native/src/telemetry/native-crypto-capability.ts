import { createIncidentRecoveryId } from "@valet/employee-client";
import { NativePinnedDiagnostics } from "./native-pinned-diagnostics";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Format checks alone never establish device CSPRNG quality. */
export function probeNativeCryptoCapability(
  pinned: NativePinnedDiagnostics,
  cryptoObject?: unknown,
): void {
  const token = pinned.begin("crypto");
  try {
    const value = arguments.length > 1 ? cryptoObject : globalThis.crypto;
    if (value === null || typeof value !== "object") {
      pinned.stage("crypto", token, "crypto-object", "missing");
      pinned.complete("crypto", token, "failed", "not-attempted");
      return;
    }
    pinned.stage("crypto", token, "crypto-object", "success");
    const provider = value as {
      getRandomValues?: (array: Uint8Array) => Uint8Array;
      randomUUID?: () => string;
    };
    if (typeof provider.getRandomValues !== "function") {
      pinned.stage("crypto", token, "get-random-values", "missing");
      pinned.stage("crypto", token, "uuid-v8-validation", "missing");
    } else {
      try {
        const bytes = new Uint8Array(16);
        const result = provider.getRandomValues(bytes);
        if (!(result instanceof Uint8Array) || result.length !== 16)
          throw new Error("Crypto fill did not return a valid byte array");
        pinned.stage("crypto", token, "get-random-values", "success");
        try {
          createIncidentRecoveryId({
            getRandomValues: (value) => provider.getRandomValues!(value),
          });
          pinned.stage("crypto", token, "uuid-v8-validation", "success");
        } catch {
          pinned.stage("crypto", token, "uuid-v8-validation", "error");
        }
      } catch {
        pinned.stage("crypto", token, "get-random-values", "error");
        pinned.stage("crypto", token, "uuid-v8-validation", "missing");
      }
    }
    if (typeof provider.randomUUID !== "function") {
      pinned.stage("crypto", token, "random-uuid", "missing");
    } else {
      try {
        const result = provider.randomUUID();
        pinned.stage("crypto", token, "random-uuid",
          typeof result === "string" && UUID_V4_PATTERN.test(result)
            ? "success" : "error");
      } catch {
        pinned.stage("crypto", token, "random-uuid", "error");
      }
    }
    // The result is finalized from the actual recorded first failure.
    pinned.complete("crypto", token, "success", "not-attempted");
  } catch {
    // Probe may not affect operational startup, regardless of platform oddities.
    pinned.stage("crypto", token, "crypto-object", "error");
    pinned.complete("crypto", token, "failed", "not-attempted");
  }
}
