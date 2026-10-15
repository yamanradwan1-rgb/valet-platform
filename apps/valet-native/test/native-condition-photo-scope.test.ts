import { describe, expect, it } from "vitest";
import { initialConditionPhotoSnapshot } from "@valet/employee-client";
import {
  photoOpening, photoOpeningIsCurrent,
} from "../src/check-in/native-condition-photo-scope";

const scope = {
  authGeneration: 7, identityGeneration: 4, membershipId: "A",
  organizationId: "org", locationId: "site-1", sessionId: "session-1",
  workflowOwner: "workflow-1",
};

describe("Native camera opening scope", () => {
  it("rejects stale picture and preview after same-account A→B→A and after auth rotation", () => {
    const atOpen = { ...initialConditionPhotoSnapshot(), ownerRevision: 12, scope };
    const opening = photoOpening(atOpen);
    expect(photoOpeningIsCurrent(opening, atOpen)).toBe(true);
    expect(photoOpeningIsCurrent(opening, {
      ...atOpen, ownerRevision: 13,
      scope: { ...scope, locationId: "site-2" },
    })).toBe(false);
    expect(photoOpeningIsCurrent(opening, {
      ...atOpen, ownerRevision: 14, scope,
    })).toBe(false);
    expect(photoOpeningIsCurrent(opening, {
      ...atOpen, ownerRevision: 12,
      scope: { ...scope, authGeneration: 8 },
    })).toBe(false);
  });
});
