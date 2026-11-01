import { describe, expect, it } from "vitest";

import { managementGuestDraftOwnerKey } from "./use-selected-management-draft-memory";
import { NestedMfaDraftMemory } from "./nested-mfa-draft-memory";

const owner = {
  identityGeneration: 3,
  sessionGeneration: 10,
  staffSessionId: "88888888-8888-4888-8888-888888888888",
  authority: "organization-A:location-A",
  currentPath: "/guest-information",
};

describe("Guest draft owner security boundary", () => {
  it("retains one logical Staff session across token refresh while fencing replacement and scope changes", () => {
    const key = managementGuestDraftOwnerKey(owner);
    expect(
      managementGuestDraftOwnerKey({ ...owner, sessionGeneration: 11 }),
    ).toBe(key);
    for (const change of [
      { staffSessionId: "99999999-9999-4999-8999-999999999999" },
      { identityGeneration: 4 },
      { authority: "organization-A:location-B" },
      { authority: "organization-B:location-A" },
      { currentPath: "/overview" },
    ]) {
      expect(managementGuestDraftOwnerKey({ ...owner, ...change })).not.toBe(
        key,
      );
    }
  });

  it("invalidates on every auth generation change when session continuity is unknown", () => {
    const unknown = { ...owner, staffSessionId: null };
    expect(
      managementGuestDraftOwnerKey({
        ...unknown,
        sessionGeneration: 11,
      }),
    ).not.toBe(managementGuestDraftOwnerKey(unknown));
  });
});

describe("Same-session refresh draft reconciliation", () => {
  it("restores only a matching authoritative resource revision after renewal", () => {
    const memory = new NestedMfaDraftMemory();
    memory.remember("contact:fields", {
      revision: 3,
      savedValue: { phone: "" },
      value: { phone: "0795432199" },
    });
    expect(memory.restore("contact:fields", 3)).toBeNull();
    memory.resumeAfterSameSessionRefresh();
    expect(memory.restore("contact:fields", 3)?.value).toEqual({
      phone: "0795432199",
    });
    expect(memory.restore("contact:fields", 4)).toBeNull();
    expect(memory.conflicts({ contact: 4 })).toEqual(["contact"]);
    memory.clear();
    expect(memory.restore("contact:fields", 3)).toBeNull();
  });

  it("does not treat a pending MFA challenge as completed assurance", () => {
    const memory = new NestedMfaDraftMemory();
    memory.remember("privacy:drafts", {
      revision: 1,
      value: { en: "unsaved" },
      savedValue: { en: "" },
    });
    memory.challenge();
    memory.resumeAfterSameSessionRefresh();
    expect(memory.restore("privacy:drafts", 1)).toBeNull();
    memory.assured();
    expect(memory.restore("privacy:drafts", 1)?.value).toEqual({
      en: "unsaved",
    });
  });
});
