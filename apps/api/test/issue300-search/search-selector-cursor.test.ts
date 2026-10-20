import { createHash } from "node:crypto";
import { describe, expect, it, afterEach, beforeEach } from "vitest";

import {
  decodeMemberSelectorCursor,
  encodeMemberSelectorCursor,
} from "../../src/modules/management/audit-investigation/search/search-selector-cursor";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const memberId = "10000000-0000-4000-8000-000000000003";
const lastId = "10000000-0000-4000-8000-000000000004";
const original = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
const binding = {
  scope: { organizationId, locationId, membershipId: memberId,
    role: "LOCATION_MANAGER" as const },
  context: { userId: memberId, staffAuthSessionId: lastId } as never,
  text: undefined,
};

beforeEach(() => {
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = createHash("sha256")
    .update("issue300-test-only-selector-key").digest("base64url");
});
afterEach(() => {
  if (original === undefined) delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = original;
});

describe("Issue300 purpose-scoped member continuation", () => {
  it("round trips only the same current role/location/staff session/filter", () => {
    const cursor = encodeMemberSelectorCursor(binding, lastId, 1_700_000_000_000);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeMemberSelectorCursor(binding, cursor, 1_700_000_000_030)).toBe(lastId);
    expect(() => decodeMemberSelectorCursor({ ...binding,
      scope: { ...binding.scope, locationId: lastId },
    }, cursor, 1_700_000_000_030)).toThrow();
    expect(() => decodeMemberSelectorCursor({ ...binding, text: "ali" },
      cursor, 1_700_000_000_030)).toThrow();
    expect(() => decodeMemberSelectorCursor({ ...binding,
      context: { userId: memberId, staffAuthSessionId: memberId } as never,
    }, cursor, 1_700_000_000_030)).toThrow();
  });

  it("rejects tamper, expiry, bad signing key and malformed identities", () => {
    const cursor = encodeMemberSelectorCursor(binding, lastId, 1_700_000_000_000);
    expect(() => decodeMemberSelectorCursor(binding, cursor.slice(0, -1) +
      (cursor.endsWith("A") ? "B" : "A"), 1_700_000_000_030)).toThrow();
    expect(() => decodeMemberSelectorCursor(binding, cursor, 1_700_000_500_000)).toThrow();
    expect(() => encodeMemberSelectorCursor(binding, "not-a-uuid")).toThrow();
    delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    expect(() => encodeMemberSelectorCursor(binding, lastId)).toThrow();
  });
});
