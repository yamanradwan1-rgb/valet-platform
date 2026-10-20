import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  saved: null as { kind: "key-slot" | "parking-spot"; resourceId: string } | null,
  created: null as ((id: string) => void) | null,
  closeLabel: null as (() => void) | null,
  parentClosed: 0,
}));

// Retain the component's successful-create state across server renders so the
// test reproduces the exact repeated-open failure without starting a browser.
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useState: (initial: typeof harness.saved) => [
      harness.saved ?? initial,
      (next: typeof harness.saved) => { harness.saved = next; },
    ],
  };
});

vi.mock("./physical-resource-create-dialog", () => ({
  PhysicalResourceCreateDialog: (props: { onCreated(id: string): void }) => {
    harness.created = props.onCreated;
    return <div data-reopen="create" />;
  },
}));
vi.mock("./parking-zone-create-dialog", () => ({
  ParkingZoneCreateDialog: () => <div data-reopen="zone" />,
}));
vi.mock("./resource-label-dialog", () => ({
  ResourceLabelDialog: (props: { onClose(): void; resourceId: string }) => {
    harness.closeLabel = props.onClose;
    return <div data-reopen="label" data-resource={props.resourceId} />;
  },
}));

import { Issue304ActionDialogs } from "./issue304-action-dialogs";
import type { Issue304ActionDialogsProps } from "./issue304-action-dialogs";

const scope = "identity:5:locationA";
const base: Issue304ActionDialogsProps = {
  action: { type: "create", kind: "parking-spot", scopeKey: scope, identityGeneration: 5 },
  api: {} as never,
  identityGeneration: 5,
  locationId: "locationA",
  locationStatus: "ACTIVE",
  managementAuthorized: true,
  scopeKey: scope,
  onClose: () => { harness.parentClosed += 1; },
  onChanged: vi.fn(),
  onReconcile: vi.fn(),
};

function render(props: Partial<Issue304ActionDialogsProps> = {}) {
  return renderToStaticMarkup(<Issue304ActionDialogs {...base} {...props} />);
}

describe("Issue #304 Spot create -> QR -> create again", () => {
  beforeEach(() => {
    harness.saved = null;
    harness.created = null;
    harness.closeLabel = null;
    harness.parentClosed = 0;
  });

  it("clears the saved resource on QR close before reopening an identical Spot-create intent", () => {
    expect(render()).toContain('data-reopen="create"');
    expect(harness.created).not.toBeNull();
    harness.created?.("first-saved-spot");
    expect(render()).toContain('data-resource="first-saved-spot"');
    expect(harness.closeLabel).not.toBeNull();
    harness.closeLabel?.();
    expect(harness.parentClosed).toBe(1);
    expect(harness.saved).toBeNull();
    expect(render()).toContain('data-reopen="create"');
    expect(render()).not.toContain('data-resource="first-saved-spot"');
  });

  it("blocks actions from another Location/identity while a previous QR was showing", () => {
    expect(render()).toContain('data-reopen="create"');
    harness.created?.("first-saved-spot");
    expect(render()).toContain('data-reopen="label"');
    expect(render({ scopeKey: "identity:5:locationB" })).toBe("");
    expect(render({ identityGeneration: 6 })).toBe("");
    harness.closeLabel?.();
    expect(render()).toContain('data-reopen="create"');
  });
});
