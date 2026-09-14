import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StaffVehicleDirectoryRow } from "@valet/contracts";

import { employeeDictionary } from "../../lib/i18n/dictionary";
import { EmployeeI18nProvider } from "../shell/employee-i18n";
import {
  directoryStateBadge,
  VehicleDirectoryRowCard,
} from "./vehicle-directory-row-card";

function baseRow(
  overrides: Partial<StaffVehicleDirectoryRow> = {},
): StaffVehicleDirectoryRow {
  return {
    createdAt: "2026-08-25T09:00:00.000Z",
    keySlotCode: null,
    keySlotVisibility: "UNASSIGNED",
    parkingSpotCode: null,
    parkingZoneCode: null,
    sessionId: "11111111-1111-4111-8111-111111111111",
    state: "PARKED",
    updatedAt: "2026-08-25T09:30:00.000Z",
    vehicle: {
      color: "Navy",
      make: "Nissan",
      model: "Patrol",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
    ...overrides,
  };
}

function renderCard(
  row: StaffVehicleDirectoryRow,
  options: { expanded?: boolean; locale?: "ar" | "en" } = {},
): string {
  const card = (
    <VehicleDirectoryRowCard
      expanded={options.expanded ?? false}
      onToggle={vi.fn()}
      row={row}
    />
  );
  if (options.locale === undefined) return renderToStaticMarkup(card);
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={options.locale}>
      {card}
    </EmployeeI18nProvider>,
  );
}

describe("VehicleDirectoryRowCard truthful rendering", () => {
  it("maps every directory lifecycle state onto existing badge vocabulary", () => {
    expect(directoryStateBadge("CHECKING_IN")).toBe("checkin");
    expect(directoryStateBadge("AWAITING_PARKING")).toBe("queued");
    expect(directoryStateBadge("PARKING")).toBe("parking");
    expect(directoryStateBadge("PARKED")).toBe("parked");
    expect(directoryStateBadge("REQUESTED")).toBe("requested");
    expect(directoryStateBadge("RETRIEVING")).toBe("retrieval");
    expect(directoryStateBadge("READY")).toBe("ready");
    expect(directoryStateBadge("HANDOFF_PENDING")).toBe("handoff");
  });

  it("falls back truthfully across descriptors, plate and codes", () => {
    const sparse = baseRow({
      vehicle: {
        color: null,
        make: null,
        model: null,
        plateCountry: null,
        plateNumberRaw: null,
        temporaryDescriptor: "White SUV, dealer plate",
      },
    });
    const markup = renderCard(sparse);
    expect(markup).toContain("White SUV, dealer plate");
    expect(markup).toContain("No plate");
    expect(markup).not.toContain("<bdi");

    const bare = baseRow({
      parkingSpotCode: "C-2",
      parkingZoneCode: null,
      vehicle: {
        color: null,
        make: null,
        model: null,
        plateCountry: null,
        plateNumberRaw: null,
        temporaryDescriptor: null,
      },
    });
    const bareMarkup = renderCard(bare);
    expect(bareMarkup).toContain("Details pending");
    expect(bareMarkup).toContain('<bdi dir="ltr">C-2</bdi>');
  });

  it("hides the detail panel until expanded and reveals row-held facts only", () => {
    const row = baseRow({
      keySlotCode: "K-07",
      keySlotVisibility: "VISIBLE",
      parkingSpotCode: "B-17",
      parkingZoneCode: "ZB",
    });
    const collapsed = renderCard(row);
    expect(collapsed).not.toContain("Read-only view");
    expect(collapsed).not.toContain(
      employeeDictionary("en").vehiclesCheckedInLabel,
    );

    const expanded = renderCard(row, { expanded: true });
    const en = employeeDictionary("en");
    expect(expanded).toContain(en.statusLabel);
    expect(expanded).toContain(en.vehiclesCheckedInLabel);
    expect(expanded).toContain(en.vehiclesUpdatedAtLabel);
    expect(expanded).toContain(en.keySlot);
    expect(expanded).toContain(en.zone);
    expect(expanded).toContain(en.spotCode);
    expect(expanded).toContain(en.vehiclesDetailReadOnly);
    // Detail is built strictly from data already present in the row.
    expect(expanded).toContain('<bdi dir="ltr">12-34567</bdi>');
    expect(expanded).toContain('<bdi dir="ltr">K-07</bdi>');
    expect(expanded).toContain('<bdi dir="ltr">ZB</bdi>');
    expect(expanded).toContain('<bdi dir="ltr">B-17</bdi>');
    // Raw session UUIDs never surface.
    expect(expanded).not.toContain(row.sessionId);
    expect(collapsed).not.toContain(row.sessionId);
  });

  it("renders dedicated localized copy for masked employee key slots", () => {
    const en = employeeDictionary("en");
    const markup = renderCard(
      baseRow({
        keySlotVisibility: "RESTRICTED",
        parkingSpotCode: "P-03",
        parkingZoneCode: "North",
      }),
      { expanded: true },
    );
    expect(markup).toContain(en.keySlotRestricted);
    expect(markup).not.toContain(en.notAssigned);
  });

  it("keeps Arabic labels and LTR identifier isolation intact", () => {
    const ar = employeeDictionary("ar");
    const row = baseRow({
      keySlotCode: "K-07",
      keySlotVisibility: "VISIBLE",
      parkingZoneCode: "ZB",
    });
    const markup = renderCard(row, { locale: "ar", expanded: true });
    expect(markup).toContain(ar.keySlot);
    expect(markup).toContain(ar.notAssigned);
    expect(markup).toContain(ar.vehiclesUpdatedAtLabel);
    expect(markup).toContain(ar.vehiclesDetailReadOnly);
    expect(markup).toContain('<bdi dir="ltr">12-34567</bdi>');
    expect(markup).toContain('<bdi dir="ltr">K-07</bdi>');
    expect(markup).toContain('aria-expanded="true"');
  });
});
