import { describe, expect, it } from "vitest";

import { sessionMayReplaceOwner } from "../src/modules/staff-push/staff-push-registration.service";
import type {
  ActiveRegistrationRow,
  LockedStaffSessionRow,
} from "../src/modules/staff-push/staff-push-registration-types";

const ownerCreated = new Date("2026-10-08T18:00:00.000Z");

function owner(
  overrides: Partial<ActiveRegistrationRow> = {},
): ActiveRegistrationRow {
  return {
    app_build: "100",
    app_identifier: "com.vaylet.employee",
    app_version: "1.0",
    id: "99999999-9999-4999-8999-999999999999",
    installation_id: "88888888-8888-4888-8888-888888888888",
    last_confirmed_at: ownerCreated,
    locale: "en",
    owner_created_at: ownerCreated,
    owner_current: true,
    owner_user_id: "user-A",
    platform: "ANDROID",
    provider: "FCM",
    staff_auth_session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    token_hash: "synthetic-token-hash",
    ...overrides,
  };
}

function caller(
  overrides: Partial<LockedStaffSessionRow> = {},
): LockedStaffSessionRow {
  return {
    created_at: new Date("2026-10-08T18:01:00.000Z"),
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    user_id: "user-A",
    ...overrides,
  };
}

describe("DEC-073 same-User later-created Staff Push replacement", () => {
  it("accepts a current later session for the exact same User", () => {
    expect(sessionMayReplaceOwner(caller(), owner())).toBe(true);
  });

  it("rejects different-User possession even if the old session is noncurrent", () => {
    expect(
      sessionMayReplaceOwner(
        caller({ user_id: "user-B" }),
        owner({ owner_current: false }),
      ),
    ).toBe(false);
  });

  it("does not let an older session reclaim an endpoint from a revoked newer owner", () => {
    expect(
      sessionMayReplaceOwner(
        caller({ created_at: new Date("2026-10-08T17:59:00.000Z") }),
        owner({ owner_current: false }),
      ),
    ).toBe(false);
  });

  it("rejects the same-timestamp older session UUID when owner is noncurrent", () => {
    expect(
      sessionMayReplaceOwner(
        caller({ created_at: ownerCreated, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
        owner({ owner_current: false }),
      ),
    ).toBe(false);
  });

  it("preserves deterministic later UUID tie-breaking for the same timestamp", () => {
    expect(
      sessionMayReplaceOwner(caller({ created_at: ownerCreated }), owner()),
    ).toBe(true);
  });
});
