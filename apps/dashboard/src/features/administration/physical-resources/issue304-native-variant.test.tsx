import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ParkingZoneCreateDialog } from "./parking-zone-create-dialog";
import { PhysicalResourceCreateDialog } from "./physical-resource-create-dialog";
import { ResourceLabelDialog } from "./resource-label-dialog";

vi.mock("../../../lib/i18n/locale-provider", () => ({
  useDashboardLocale: () => ({ locale: "en" }),
}));

vi.mock("./use-parking-zone-page", () => ({
  useParkingZonePage: () => ({
    data: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
  }),
}));

const base = {
  api: {} as never,
  identityGeneration: 1,
  locationId: "location-a",
  scopeKey: "identity-1:location-a",
  onClose: vi.fn(),
  onReconcile: vi.fn(),
};

describe("Issue #304 native dialog optional variant safety", () => {
  it("keeps the default key creation structure and shows the special header only when opted in", () => {
    const props = {
      ...base,
      kind: "key-slot" as const,
      onCreated: vi.fn(),
    };
    const legacy = renderToStaticMarkup(<PhysicalResourceCreateDialog {...props} />);
    const approved = renderToStaticMarkup(
      <PhysicalResourceCreateDialog {...props} issue304Variant />,
    );
    expect(legacy).toContain("Add Key Slot");
    expect(legacy).not.toContain("issue304-modal-heading");
    expect(legacy).not.toContain("RESOURCE CREATION");
    expect(approved).toContain("issue304-modal-heading");
    expect(approved).toContain("RESOURCE CREATION");
    expect(approved).toContain('aria-label="Close"');
    expect(approved).not.toContain("DESIGN PREVIEW");
  });

  it("preserves the original zone dialog without the optional variant", () => {
    const props = { ...base, onCreated: vi.fn() };
    const legacy = renderToStaticMarkup(<ParkingZoneCreateDialog {...props} />);
    const approved = renderToStaticMarkup(
      <ParkingZoneCreateDialog {...props} issue304Variant />,
    );
    expect(legacy).toContain("Add Parking Zone");
    expect(legacy).not.toContain("issue304-modal-heading");
    expect(approved).toContain("PARKING ZONE");
    expect(approved).toContain('aria-label="Close"');
    expect(approved).toContain('placeholder="Z-C"');
    expect(approved).toContain("Resource code");
    expect(approved).toContain("Display label");
    expect(approved).toContain("Create a parking zone in this Location.");
  });

  it("preserves live QR read semantics while changing only optional label presentation", () => {
    const props = {
      ...base,
      kind: "parking-spot" as const,
      resourceId: "real-resource-id",
    };
    const legacy = renderToStaticMarkup(<ResourceLabelDialog {...props} />);
    const approved = renderToStaticMarkup(
      <ResourceLabelDialog {...props} issue304Variant />,
    );
    expect(legacy).toContain("Physical resource label");
    expect(legacy).not.toContain("issue304-modal-heading");
    expect(approved).toContain("RESOURCE LABEL");
    expect(approved).toContain('data-issue304-label-locale="en"');
    expect(legacy).not.toContain("data-issue304-label-locale");
    expect(approved).not.toContain("DESIGN PREVIEW");
    // Before the authenticated label GET resolves, neither mode invents a QR.
    expect(legacy).not.toContain("<img");
    expect(approved).not.toContain("<img");
  });
});
