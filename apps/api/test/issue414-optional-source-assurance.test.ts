import { describe, expect, it, vi } from "vitest";
import { MfaStepUpRequiredError } from "../src/modules/auth/mfa/mfa-errors";
import { ManagementAccessDeniedError } from "../src/modules/management/management-authorization";
import {
  readOptionalProtectedShift,
  readOptionalSensitiveTakeovers,
} from "../src/modules/dashboard/management-alert-source-assurance-optional";

describe("Issue414 source-specific assurance is not whole-bell access", () => {
  it("leaves permitted source rows unchanged", async () => {
    const cases = [{ episodeId: "one" }];
    await expect(
      readOptionalSensitiveTakeovers(async () => cases),
    ).resolves.toBe(cases);
    await expect(readOptionalProtectedShift(async () => cases)).resolves.toBe(
      cases,
    );
  });

  it("hides only the CA-sensitive takeover category when fresh MFA expires", async () => {
    const lookup = vi.fn().mockRejectedValue(new MfaStepUpRequiredError());
    await expect(readOptionalSensitiveTakeovers(lookup)).resolves.toEqual([]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("hides only LM-protected shift history when its independent assurance denies", async () => {
    await expect(
      readOptionalProtectedShift(async () => {
        throw new ManagementAccessDeniedError();
      }),
    ).resolves.toEqual([]);
  });

  it("never transforms a PostgreSQL, integrity or unrelated denial into false zero", async () => {
    const databaseFailure = Object.assign(new Error("database down"), {
      code: "57P01",
    });
    await expect(
      readOptionalSensitiveTakeovers(async () => {
        throw databaseFailure;
      }),
    ).rejects.toBe(databaseFailure);
    await expect(
      readOptionalProtectedShift(async () => {
        throw databaseFailure;
      }),
    ).rejects.toBe(databaseFailure);
    await expect(
      readOptionalSensitiveTakeovers(async () => {
        throw new ManagementAccessDeniedError();
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    await expect(
      readOptionalProtectedShift(async () => {
        throw new MfaStepUpRequiredError();
      }),
    ).rejects.toBeInstanceOf(MfaStepUpRequiredError);
  });
});
