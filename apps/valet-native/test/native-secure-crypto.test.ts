import { describe, expect, it, vi } from "vitest";
import { createIncidentRecoveryId } from "@valet/employee-client";
import {
  nativeSecureRandomUUID, nativeSecureRandomValues, resolveNativeSecureCrypto,
  type NativeSecureCrypto,
} from "../src/crypto/native-secure-crypto";

const validV4 = "12345678-1234-4123-8123-123456789abc";
const provider: NativeSecureCrypto = {
  getRandomValues: (value) => {
    for (let index = 0; index < value.length; index++) value[index] = index;
    return value;
  },
  randomUUID: () => validV4,
};

describe("approved Expo Native CSPRNG adapter", () => {
  it("uses injected secure bytes for existing RFC 9562 UUIDv8 without global Crypto", () => {
    vi.stubGlobal("crypto", undefined);
    try {
      const generated = createIncidentRecoveryId({
        getRandomValues: (array) => nativeSecureRandomValues(array, provider),
      });
      expect(generated).toBe("00010203-0405-8607-8809-0a0b0c0d0e0f");
      expect(nativeSecureRandomUUID(provider)).toBe(validV4);
    } finally { vi.unstubAllGlobals(); }
  });

  it("rejects a missing Native module; never uses Math.random or global Crypto", () => {
    const insecure = vi.spyOn(Math, "random");
    try {
      expect(() => nativeSecureRandomValues(new Uint8Array(16), null)).toThrow();
      expect(() => nativeSecureRandomUUID(null)).toThrow();
      expect(insecure).not.toHaveBeenCalled();
    } finally { insecure.mockRestore(); }
  });

  it("rejects throwing, wrong-array or invalid native responses", () => {
    const bytes = new Uint8Array(16);
    expect(() => nativeSecureRandomValues(bytes, {
      ...provider, getRandomValues: () => { throw Error("native unavailable"); },
    })).toThrow();
    expect(() => nativeSecureRandomValues(bytes, {
      ...provider, getRandomValues: () => new Uint8Array(16),
    })).toThrow("NATIVE_CSPRNG_UNAVAILABLE");
    for (const invalid of ["", "123", "00000000-0000-8000-8000-000000000000"]) {
      expect(() => nativeSecureRandomUUID({ ...provider, randomUUID: () => invalid }))
        .toThrow("NATIVE_CSPRNG_UNAVAILABLE");
    }
  });

  it("does not mistake an unlinked Node host for an Android native provider", () => {
    // Production uses the same guarded resolver; this test environment has no
    // linked Android Native modules and cannot establish OS entropy quality.
    expect(resolveNativeSecureCrypto()).toBeNull();
  });
});
