import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StaffVehicleDirectoryRow } from "@valet/contracts";

import { employeeDictionary } from "../../lib/i18n/dictionary";
import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import { EmployeeI18nProvider } from "../shell/employee-i18n";
import * as rowCardModule from "./vehicle-directory-row-card";
import { VehiclesListLive } from "./vehicles-list-live";

vi.mock("../../features/vehicles-directory", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../features/vehicles-directory")>();
  return {
    ...actual,
    useVehicleDirectory: vi.fn(),
  };
});

const { useVehicleDirectory } =
  await import("../../features/vehicles-directory");

const SCOPE: ResolvedOperationalScope = {
  activeContext: {} as ResolvedOperationalScope["activeContext"],
  currency: "JOD",
  locationCode: "AMM-01",
  locationId: "22222222-2222-4222-8222-222222222222",
  locationName: "Amman Ridge Hotel",
  membershipId: "33333333-3333-4333-8333-333333333333",
  organizationId: "44444444-4444-4444-8444-444444444444",
  organizationName: "VAYLET Operations",
  role: "VALET_EMPLOYEE",
  shiftId: "55555555-5555-4555-8555-555555555555",
  shiftStartedAt: "2026-08-25T10:00:00.000Z",
};

function supervisorRow(): StaffVehicleDirectoryRow {
  return {
    createdAt: "2026-08-25T09:00:00.000Z",
    keySlotCode: "K-07",
    keySlotVisibility: "VISIBLE",
    parkingSpotCode: "B-17",
    parkingZoneCode: "ZB",
    sessionId: "11111111-1111-4111-8111-111111111111",
    state: "PARKED",
    updatedAt: "2026-08-25T09:30:00.000Z",
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "87-65432",
      temporaryDescriptor: null,
    },
  };
}

function employeeRow(): StaffVehicleDirectoryRow {
  return {
    createdAt: "2026-08-25T08:00:00.000Z",
    keySlotCode: null,
    keySlotVisibility: "RESTRICTED",
    parkingSpotCode: null,
    parkingZoneCode: null,
    sessionId: "88888888-8888-4888-8888-888888888888",
    state: "AWAITING_PARKING",
    updatedAt: "2026-08-25T08:30:00.000Z",
    vehicle: {
      color: null,
      make: null,
      model: null,
      plateCountry: null,
      plateNumberRaw: null,
      temporaryDescriptor: "White sedan",
    },
  };
}

function stubDirectory(
  overrides: Partial<{
    error: Error | null;
    isLoading: boolean;
    isRefreshing: boolean;
    retry: () => void;
    rows: StaffVehicleDirectoryRow[];
    truncated: boolean;
  }> = {},
): void {
  vi.mocked(useVehicleDirectory).mockReturnValue({
    error: null,
    isLoading: false,
    isRefreshing: false,
    retry: vi.fn(),
    rows: [],
    truncated: false,
    ...overrides,
  });
}

function renderList(options: { locale?: "ar" | "en" } = {}): string {
  const list = (
    <VehiclesListLive
      activeScope={SCOPE}
      client={{ request: vi.fn() } as never}
      onAuthorizationLoss={vi.fn()}
    />
  );
  if (options.locale === undefined) return renderToStaticMarkup(list);
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={options.locale}>
      {list}
    </EmployeeI18nProvider>,
  );
}

describe("DEC-066 §6–§12 Live Vehicles directory (VUI-011C)", () => {
  it("renders a loading skeleton while the authoritative page loads", () => {
    stubDirectory({ isLoading: true });
    const markup = renderList();
    expect(markup).toContain("Loading vehicles...");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("animate-pulse");
  });

  it("shows a truthful empty state when the location has no active vehicles", () => {
    stubDirectory({ rows: [] });
    const markup = renderList();
    expect(markup).toContain("No active vehicles right now");
    expect(markup).toContain(
      "Vehicles appear here while check-in, parking or retrieval is in progress.",
    );
  });

  it("renders an error state with a retry affordance and no backend error leak", () => {
    stubDirectory({
      error: new Error("STAFF_VEHICLE_DIRECTORY_READ failed"),
      retry: vi.fn(),
    });
    const markup = renderList();
    expect(markup).toContain("The vehicle list could not be loaded.");
    expect(markup).toContain(">Retry</button>");
    expect(markup).not.toContain("STAFF_VEHICLE_DIRECTORY_READ");
  });

  it("renders populated rows truthfully for employees: masked key slot, safe placeholders", () => {
    stubDirectory({ rows: [employeeRow()] });
    const markup = renderList();
    // Temporary-descriptor headline; readable lifecycle badge vocabulary.
    expect(markup).toContain("White sedan");
    expect(markup).toContain("Queued");
    // Missing plate is stated, never faked.
    expect(markup).toContain("No plate");
    // Employee rows carry a null code plus an authoritative masking signal.
    expect(markup).toContain("Restricted");
    expect(markup.indexOf("Restricted")).toBeLessThan(
      markup.indexOf("Parking area"),
    );
    expect(markup).not.toContain("K-07");
    // No raw session UUIDs anywhere.
    expect(markup).not.toContain(employeeRow().sessionId);
  });

  it("isolates plates, zone/spot codes and supervisor key slots LTR", () => {
    stubDirectory({ rows: [supervisorRow()] });
    const markup = renderList();
    expect(markup).toContain('<bdi dir="ltr">87-65432</bdi>');
    expect(markup).toContain('<bdi dir="ltr">ZB</bdi>');
    expect(markup).toContain('<bdi dir="ltr">B-17</bdi>');
    expect(markup).toContain('<bdi dir="ltr">K-07</bdi>');
    expect(markup).toContain("Toyota Camry");
    expect(markup).toContain("Parked");
    expect(markup).toContain("Updated");
    expect(markup).not.toContain(supervisorRow().sessionId);
  });

  it("shows the truncation indicator exactly when truncated=true, never claiming completeness", () => {
    stubDirectory({ rows: [supervisorRow()], truncated: false });
    expect(renderList()).not.toContain(
      employeeDictionary("en").vehiclesTruncatedNotice,
    );

    stubDirectory({ rows: [supervisorRow()], truncated: true });
    const markup = renderList();
    expect(markup).toContain(employeeDictionary("en").vehiclesTruncatedNotice);
    // Truthful cap wording only: no completeness claims, no total count.
    expect(/all .*vehicles are shown|complete list/i.test(markup)).toBe(false);
  });

  it("has no search box, no filters, and no prototype strings anywhere", () => {
    stubDirectory({ rows: [supervisorRow(), employeeRow()] });
    const markup = renderList();
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain('type="search"');
    expect(markup).not.toContain("Search plate or vehicle...");
    expect(markup).not.toContain("BMW X5");
    expect(markup).not.toContain("Mercedes E-Class");
    expect(markup).not.toContain("Audi Q7");
    expect(markup).not.toContain("Range Rover Sport");
    expect(markup).not.toContain("Main Entrance");
    expect(markup).not.toContain("Zone B · B-17");
  });

  it("row tap expands read-only detail only: no fetch, no mutation, no retry", () => {
    const retrySpy = vi.fn();
    stubDirectory({ rows: [supervisorRow()], retry: retrySpy });
    const requestSpy = vi.fn();

    let capturedToggle: (() => void) | null = null;
    const cardSpy = vi
      .spyOn(rowCardModule, "VehicleDirectoryRowCard")
      .mockImplementation((props) => {
        capturedToggle = props.onToggle;
        return <div id="mock-row-card" />;
      });

    renderToStaticMarkup(
      <VehiclesListLive
        activeScope={SCOPE}
        client={{ request: requestSpy } as never}
        onAuthorizationLoss={vi.fn()}
      />,
    );

    expect(capturedToggle).not.toBeNull();
    capturedToggle!();

    // DEC-066 §10: expanding a row performs zero network work.
    expect(requestSpy).not.toHaveBeenCalled();
    expect(retrySpy).not.toHaveBeenCalled();
    cardSpy.mockRestore();
  });

  it("renders localized Arabic copy for every surface state", () => {
    const ar = employeeDictionary("ar");

    stubDirectory({ rows: [supervisorRow()] });
    const markup = renderList({ locale: "ar" });
    expect(markup).toContain(ar.vehiclesNav);
    expect(markup).toContain(ar.location);
    expect(markup).toContain('<bdi dir="ltr">K-07</bdi>');
    expect(markup).toContain(ar.vehiclesUpdatedAtLabel);

    stubDirectory({ rows: [] });
    const emptyAr = renderList({ locale: "ar" });
    expect(emptyAr).toContain(ar.vehiclesEmptyTitle);
    expect(emptyAr).toContain(ar.vehiclesEmptyDetail);

    stubDirectory({ rows: [supervisorRow()], truncated: true });
    const truncatedAr = renderList({ locale: "ar" });
    expect(truncatedAr).toContain(ar.vehiclesTruncatedNotice);

    stubDirectory({ error: new Error("boom") });
    const errorAr = renderList({ locale: "ar" });
    expect(errorAr).toContain(ar.vehiclesLoadFailed);
  });
});
