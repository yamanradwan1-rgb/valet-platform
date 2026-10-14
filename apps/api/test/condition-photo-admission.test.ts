import { describe, expect, it, vi } from "vitest";

import type { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { ConditionPhotoAdmission } from "../src/modules/vehicle-photos/condition-photo-admission";

function fixture(userBlocked?: number, sessionBlocked?: number) {
  const calls: string[] = [];
  const database = {
    key: vi.fn((scope: string, value: string) => ({ scope, value })),
    transaction: vi.fn(async (action: (tx: object) => Promise<unknown>) =>
      action({}),
    ),
    blockerInTransaction: vi.fn(async (_tx: object, key: { scope: string }) => {
      calls.push(`check:${key.scope}`);
      return key.scope.endsWith("-session") ? sessionBlocked : userBlocked;
    }),
    countInTransaction: vi.fn(async (_tx: object, key: { scope: string }) => {
      calls.push(`count:${key.scope}`);
      return { allowed: true as const };
    }),
    count: vi.fn(async () => ({ allowed: true as const })),
  };
  return {
    calls,
    database,
    admission: new ConditionPhotoAdmission(
      database as unknown as AntiAbuseService,
    ),
  };
}

describe("condition-photo durable admission", () => {
  it("counts user and session in a single transaction after both limits pass", async () => {
    const { admission, database, calls } = fixture();
    expect(await admission.uploadStart("user-1", "session-1")).toEqual({
      allowed: true,
    });
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      "check:v1:condition-photo-upload-user",
      "check:v1:condition-photo-upload-session",
      "count:v1:condition-photo-upload-user",
      "count:v1:condition-photo-upload-session",
    ]);
    expect(database.key).toHaveBeenNthCalledWith(
      1,
      "v1:condition-photo-upload-user",
      "user-1",
    );
    expect(database.key).toHaveBeenNthCalledWith(
      2,
      "v1:condition-photo-upload-session",
      "session-1",
    );
  });

  it("rejects a user-saturated attempt without consuming either budget", async () => {
    const { admission, database, calls } = fixture(23);
    expect(await admission.uploadStart("u", "s")).toEqual({
      allowed: false,
      retryAfter: 23,
    });
    expect(calls).toEqual(["check:v1:condition-photo-upload-user"]);
    expect(database.countInTransaction).not.toHaveBeenCalled();
  });

  it("rejects a session-saturated attempt without counting user budget", async () => {
    const { admission, database, calls } = fixture(undefined, 47);
    expect(await admission.uploadStart("u", "s")).toEqual({
      allowed: false,
      retryAfter: 47,
    });
    expect(calls).toEqual([
      "check:v1:condition-photo-upload-user",
      "check:v1:condition-photo-upload-session",
    ]);
    expect(database.countInTransaction).not.toHaveBeenCalled();
  });

  it("uses a separate bounded read budget", async () => {
    const { admission, database } = fixture();
    expect(await admission.statusRead("u")).toEqual({ allowed: true });
    expect(database.key).toHaveBeenCalledWith(
      "v1:condition-photo-status-user",
      "u",
    );
    expect(database.count).toHaveBeenCalledWith(
      { scope: "v1:condition-photo-status-user", value: "u" },
      120,
    );
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
