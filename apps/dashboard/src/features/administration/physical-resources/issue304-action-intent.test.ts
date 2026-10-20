import { describe, expect, it } from "vitest";

import {
  issue304ActionIsCurrent,
  type Issue304ActionIntent,
} from "./issue304-action-intent";

const location = {
  scopeKey: "identity:4:loc-a",
  identityGeneration: 4,
  locationStatus: "ACTIVE" as const,
  managementAuthorized: true,
};

const create: Issue304ActionIntent = {
  type: "create",
  kind: "key-slot",
  scopeKey: location.scopeKey,
  identityGeneration: location.identityGeneration,
};

describe("Issue #304 real-action scope fencing", () => {
  it("permits an exact authorized active-Location intent", () => {
    expect(issue304ActionIsCurrent(create, location)).toBe(true);
    expect(issue304ActionIsCurrent({ ...create, kind: "parking-spot" }, location)).toBe(true);
    expect(issue304ActionIsCurrent({
      type: "create-zone",
      scopeKey: location.scopeKey,
      identityGeneration: 4,
    }, location)).toBe(true);
  });

  it("does not expose management actions on an inactive or unauthorized Location", () => {
    expect(issue304ActionIsCurrent(create, { ...location, locationStatus: "INACTIVE" })).toBe(false);
    expect(issue304ActionIsCurrent(create, { ...location, managementAuthorized: false })).toBe(false);
  });

  it("discards stale A→B→A and old identity intents", () => {
    expect(issue304ActionIsCurrent(create, { ...location, scopeKey: "identity:4:loc-b" })).toBe(false);
    expect(issue304ActionIsCurrent(create, { ...location, identityGeneration: 5 })).toBe(false);
    expect(issue304ActionIsCurrent(null, location)).toBe(false);
  });

  it("rejects missing label IDs and applies the same scope guard to QR label actions", () => {
    const label: Issue304ActionIntent = {
      type: "label",
      kind: "parking-spot",
      resourceId: "persisted-spot-id",
      scopeKey: location.scopeKey,
      identityGeneration: 4,
    };
    expect(issue304ActionIsCurrent(label, location)).toBe(true);
    expect(issue304ActionIsCurrent({ ...label, resourceId: "" }, location)).toBe(false);
    expect(issue304ActionIsCurrent(label, { ...location, scopeKey: "another-Location" })).toBe(false);
  });
});
