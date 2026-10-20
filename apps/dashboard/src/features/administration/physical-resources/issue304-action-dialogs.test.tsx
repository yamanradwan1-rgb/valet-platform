import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Issue304ActionDialogs } from "./issue304-action-dialogs";
import type { Issue304ActionDialogsProps } from "./issue304-action-dialogs";

vi.mock("./physical-resource-create-dialog", () => ({
  PhysicalResourceCreateDialog: ({ kind, scopeKey }: { kind: string; scopeKey: string }) => (
    <div data-dialog="create" data-kind={kind} data-scope={scopeKey} />
  ),
}));

vi.mock("./parking-zone-create-dialog", () => ({
  ParkingZoneCreateDialog: ({ scopeKey }: { scopeKey: string }) => (
    <div data-dialog="zone" data-scope={scopeKey} />
  ),
}));

vi.mock("./resource-label-dialog", () => ({
  ResourceLabelDialog: ({ kind, resourceId }: { kind: string; resourceId: string }) => (
    <div data-dialog="persisted-label" data-kind={kind} data-resource-id={resourceId} />
  ),
}));

const base: Issue304ActionDialogsProps = {
  action: {
    type: "create",
    kind: "key-slot",
    identityGeneration: 2,
    scopeKey: "identity2:locationA",
  },
  api: {} as Issue304ActionDialogsProps["api"],
  identityGeneration: 2,
  locationId: "locationA",
  locationStatus: "ACTIVE",
  managementAuthorized: true,
  scopeKey: "identity2:locationA",
  onClose: vi.fn(),
  onChanged: vi.fn(),
  onReconcile: vi.fn(),
};

function page(changes: Partial<Issue304ActionDialogsProps> = {}) {
  return renderToStaticMarkup(<Issue304ActionDialogs {...base} {...changes} />);
}

describe("Issue #304 reusable persisted action dialogs", () => {
  it("routes key and spot creation through existing production create dialog", () => {
    expect(page()).toContain('data-dialog="create"');
    expect(page()).toContain('data-kind="key-slot"');
    expect(page({
      action: { type: "create", kind: "parking-spot", scopeKey: base.scopeKey, identityGeneration: 2 },
    })).toContain('data-kind="parking-spot"');
  });

  it("routes zone creation through the production zone create dialog", () => {
    expect(page({
      action: { type: "create-zone", scopeKey: base.scopeKey, identityGeneration: 2 },
    })).toContain('data-dialog="zone"');
  });

  it("renders a server-fetched label dialog for a persisted resource ID", () => {
    const result = page({
      action: {
        type: "label",
        kind: "parking-spot",
        resourceId: "saved-spot-uuid",
        scopeKey: base.scopeKey,
        identityGeneration: 2,
      },
    });
    expect(result).toContain('data-dialog="persisted-label"');
    expect(result).toContain('data-resource-id="saved-spot-uuid"');
    expect(result).not.toContain('data-dialog="create"');
  });

  it("refuses stale scopes, revoked authority, inactive locations and absent actions", () => {
    expect(page({ action: null })).toBe("");
    expect(page({ managementAuthorized: false })).toBe("");
    expect(page({ locationStatus: "INACTIVE" })).toBe("");
    expect(page({ scopeKey: "identity2:locationB" })).toBe("");
    expect(page({ identityGeneration: 3 })).toBe("");
  });
});
