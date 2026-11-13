import { describe, expect, it } from "vitest";

import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import { requireRequestBearerPossession } from "../src/modules/auth/staff-auth-vap1-bearer";

describe("VAP1 Staff request raw bearer possession precondition", () => {
  const raw = generateStaffCredential("vsa1.");
  const authorization = `Bearer ${raw}`;
  const context = { accessTokenHash: staffCredentialHash("access", raw) };

  it("matches a genuine submitted credential with the exact context digest", () => {
    expect(() =>
      requireRequestBearerPossession(authorization, context),
    ).not.toThrow();
  });

  it("rejects SQL-readable hashes or IDs without the actual Bearer", () => {
    for (const supplied of [
      undefined,
      "",
      context.accessTokenHash,
      "Bearer user-id",
    ]) {
      expect(() => requireRequestBearerPossession(supplied, context)).toThrow();
    }
  });

  it("rejects stale or synthetic context even with a valid Bearer", () => {
    const other = generateStaffCredential("vsa1.");
    for (const observedHash of [
      staffCredentialHash("access", other),
      staffCredentialHash("refresh", other),
      "0".repeat(64),
    ]) {
      expect(() =>
        requireRequestBearerPossession(authorization, {
          accessTokenHash: observedHash,
        }),
      ).toThrow();
    }
  });

  it("fails closed for malformed/alternate authorization transport", () => {
    for (const supplied of [
      `bearer ${raw}`,
      `Bearer ${raw},Bearer ${raw}`,
      `Bearer ${raw} extra`,
      `Bearer ${generateStaffCredential("vsr1.")}`,
    ]) {
      expect(() => requireRequestBearerPossession(supplied, context)).toThrow();
    }
  });

  it("never includes a submitted secret or stored hash in a failure message", () => {
    const staleContext = {
      accessTokenHash: staffCredentialHash(
        "access",
        generateStaffCredential("vsa1."),
      ),
    };
    try {
      requireRequestBearerPossession(authorization, staleContext);
      throw new Error("Unexpected bearer acceptance");
    } catch (error) {
      expect((error as Error).message).not.toContain(raw);
      expect((error as Error).message).not.toContain(
        staleContext.accessTokenHash,
      );
    }
  });
});
