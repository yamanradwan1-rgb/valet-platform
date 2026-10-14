import { describe, expect, it } from "vitest";

import {
  ConditionPhotoDatabaseError,
  safeConditionPhotoDbError,
} from "../src/modules/vehicle-photos/condition-photo-db-errors";

describe("P2 fail-closed PostgreSQL error classification", () => {
  it.each([
    ["23505", "replay conflict", "CONDITION_PHOTO_OPERATION_CONFLICT"],
    ["42501", "scope denied", "CONDITION_PHOTO_NOT_FOUND"],
    ["53300", "Condition photo session maximum reached", "CONDITION_PHOTO_LIMIT_REACHED"],
    ["53300", "Condition photo concurrent upload limit reached", "CONDITION_PHOTO_RATE_LIMITED"],
    ["53300", "sorry, too many clients already", "CONDITION_PHOTO_STORAGE_UNAVAILABLE"],
    ["55000", "Condition photo expired operation", "CONDITION_PHOTO_EXPIRED"],
    ["55000", "Condition photo requires explicit reconcile", "CONDITION_PHOTO_OPERATION_CONFLICT"],
    ["57014", "query canceled", "CONDITION_PHOTO_STORAGE_UNAVAILABLE"],
  ])("maps SQLSTATE %s without exposing SQL details", (sqlstate, detail, expected) => {
    const mapped = safeConditionPhotoDbError({ code: sqlstate, message: detail });
    expect(mapped).toBeInstanceOf(ConditionPhotoDatabaseError);
    expect((mapped as ConditionPhotoDatabaseError).code).toBe(expected);
    expect(mapped.message).not.toContain(detail);
  });

  it("does not whitelist unrecognized DB errors", () => {
    const unknown = new Error("database disconnected");
    expect(safeConditionPhotoDbError(unknown)).toBe(unknown);
  });
});
