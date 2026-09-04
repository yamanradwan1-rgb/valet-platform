import { describe, expect, it } from "vitest";
import type { NativeAuthSnapshot } from "@valet/employee-client";

import { getNativeAuthCopy } from "../src/auth/native-auth-copy";
import { getNativePocPresentation } from "../src/auth/native-poc-presentation";

const idleProbes = {
  apiReachability: "idle",
  installationStorage: "idle",
  secureStore: "idle",
} as const;

const storageFailure: NativeAuthSnapshot = {
  authGeneration: 4,
  phase: "unauthenticated",
  reason: "secure-storage-failure",
};

describe("Native physical POC presentation", () => {
  it("is absent outside development while production auth copy stays generic", () => {
    expect(
      getNativePocPresentation(
        false,
        "https://api.example.com",
        idleProbes,
        storageFailure,
      ),
    ).toBeNull();

    const loginFailure = getNativeAuthCopy("en").loginFailed;
    expect(loginFailure).toBe(
      "Sign-in was not completed. Check your details and try again.",
    );
    expect(loginFailure).not.toContain("secure-storage-failure");
  });

  it("exposes only the sanitized exact development snapshot fields", () => {
    const presentation = getNativePocPresentation(
      true,
      "http://192.168.1.67:3001",
      idleProbes,
      storageFailure,
    );

    expect(presentation).toMatchObject({
      apiOrigin: "http://192.168.1.67:3001",
      authGeneration: "4",
      authPhase: "unauthenticated",
      authReason: "secure-storage-failure",
    });
    expect(Object.keys(presentation ?? {}).sort()).toEqual(
      [
        "apiOrigin",
        "apiReachability",
        "authGeneration",
        "authPhase",
        "authReason",
        "installationStorage",
        "secureStore",
        "title",
      ].sort(),
    );
    const rendered = JSON.stringify(presentation);
    for (const forbidden of [
      "password",
      "accessToken",
      "refreshToken",
      "dynamicProof",
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
  });
});
