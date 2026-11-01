import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShiftPresenceError } from "../src/modules/shifts/shift-presence-errors";
import {
  PresenceManagementBusyError,
  presenceManagementBusyOrigin,
  recordPresenceManagementBusy,
} from "../src/modules/management/presence-management-diagnostics";
import {
  recoverPresenceManagementRead,
  isRecoverablePresenceRead,
} from "../src/modules/management/presence-management-read-recovery";
import {
  isGuestDatabaseOperation,
  remainingDatabaseOperationMs,
  withDatabaseDeadline,
  withGeneralDatabaseDeadline,
} from "../src/common/database/runtime-database-deadline";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Presence read recovery eligibility and safe diagnostics", () => {
  it.each([
    [
      new PresenceManagementBusyError("ADVISORY_TRY_LOCK_BUSY"),
      "ADVISORY_TRY_LOCK_BUSY",
    ],
    [{ code: "55P03" }, "POSTGRES_LOCK_NOT_AVAILABLE_55P03"],
    [{ code: "40P01" }, "POSTGRES_DEADLOCK_40P01"],
  ])("classifies the exact origin", (error, origin) => {
    expect(presenceManagementBusyOrigin(error)).toBe(origin);
  });
  it.each([
    "EXCEPTION_LIST",
    "EXCEPTION_READ",
    "EXCEPTION_REVIEW",
    "RESULT_READ",
    "COMPANY_POLICY_SET",
    "LOCATION_POLICY_CHANGE",
    "ZONE_SAVE",
  ] as const)("never opts %s into recovery", (name) => {
    expect(isRecoverablePresenceRead(name)).toBe(false);
  });
  it.each([
    { code: "55P03" },
    { code: "40P01" },
    new ShiftPresenceError("PRESENCE_AUTHORITY_BUSY"),
    { code: "AUTHORIZATION_DENIED" },
  ])(
    "does not retry arbitrary busy/database/authority failures",
    async (error) => {
      const attempt = vi.fn().mockRejectedValue(error);
      await expect(recoverPresenceManagementRead(attempt)).rejects.toBe(error);
      expect(attempt).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps general lease policy and does not extend an enclosing deadline", async () => {
    await withGeneralDatabaseDeadline(1000, async () => {
      expect(isGuestDatabaseOperation()).toBe(false);
      await withGeneralDatabaseDeadline(2000, async () => {
        expect(remainingDatabaseOperationMs(3000)).toBeLessThanOrEqual(1000);
      });
    });
    await withDatabaseDeadline(500, async () => {
      expect(isGuestDatabaseOperation()).toBe(true);
      await withGeneralDatabaseDeadline(1000, async () => {
        expect(isGuestDatabaseOperation()).toBe(true);
        expect(remainingDatabaseOperationMs(2000)).toBeLessThanOrEqual(500);
      });
    });
  });
  it("backoff stops at a shorter enclosing request budget without a new attempt", async () => {
    vi.useFakeTimers();
    const attempt = vi
      .fn()
      .mockRejectedValue(
        new PresenceManagementBusyError("ADVISORY_TRY_LOCK_BUSY"),
      );
    const result = withGeneralDatabaseDeadline(10, () =>
      recoverPresenceManagementRead(attempt),
    );
    await expect(result).rejects.toMatchObject({
      origin: "ADVISORY_TRY_LOCK_BUSY",
    });
    expect(attempt).toHaveBeenCalledTimes(1);
  });
  it("deadlocks log at error severity; logging failure never changes responses", () => {
    const error = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {
      throw new Error("logger down");
    });
    recordPresenceManagementBusy(
      "ZONE_LIST",
      "POSTGRES_DEADLOCK_40P01",
      1,
      20,
      "FAILED",
    );
    expect(error).toHaveBeenCalledWith(
      "PRESENCE_MANAGEMENT operation=ZONE_LIST origin=POSTGRES_DEADLOCK_40P01 outcome=FAILED attempts=1 durationMs=20",
    );
    expect(() =>
      recordPresenceManagementBusy(
        "ZONE_LIST",
        "ADVISORY_TRY_LOCK_BUSY",
        2,
        30,
        "RECOVERED",
      ),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
