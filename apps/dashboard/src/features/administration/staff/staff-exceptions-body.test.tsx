import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SelectedDashboardScope } from "../../../components/scope";
import { StaffExceptionsBody } from "./staff-exceptions-body";

const mocks = vi.hoisted(() => ({
  selected: null as unknown,
  locale: "en" as "en" | "ar",
  apiCalls: [] as boolean[],
  listTargets: [] as unknown[],
  readCalls: [] as string[],
  read: {
    data: { overrides: {}, capabilities: { canReviewExceptions: true } },
    error: null as Error | null,
    loading: false,
    refresh: () => {},
    replace: () => {},
  },
}));

vi.mock("../../../components/foundation/protected-dashboard-context", () => ({
  useProtectedDashboard: () => ({
    selectedScope: mocks.selected,
    identityGeneration: 1,
    sessionGeneration: 1,
    selectionRevision: 1,
    api: {},
  }),
}));
vi.mock("../../../lib/i18n/locale-provider", () => ({
  useDashboardLocale: () => ({ locale: mocks.locale }),
}));
vi.mock("../settings/use-presence-api", () => ({
  usePresenceApi: (company: boolean) => {
    mocks.apiCalls.push(company);
    return { api: { target: mocks.selected, policy: () => Promise.resolve({}) },
      live: { current: true } };
  },
}));
vi.mock("../use-authoritative-read", () => ({
  useAuthoritativeRead: (key: string) => {
    mocks.readCalls.push(key);
    return mocks.read;
  },
}));
vi.mock("../settings/use-shift-presence-mutation", () => ({
  useShiftPresenceMutation: () => ({
    denied: false,
    blocked: false,
    message: null,
    mfaOpen: false,
    onAssured: () => {},
    closeMfa: () => {},
  }),
}));
vi.mock("../settings/shift-presence-exceptions", () => ({
  ShiftPresenceExceptions: (props: { api: { target: unknown } }) => {
    mocks.listTargets.push(props.api.target);
    return "SCOPED_EXCEPTIONS_LIST";
  },
}));

const locationId = "33333333-3333-4333-8333-333333333333";
const otherLocationId = "44444444-4444-4444-8444-444444444444";
const organizationId = "11111111-1111-4111-8111-111111111111";
const location = {
  locationId,
  name: "Main Garage",
  status: "ACTIVE" as const,
  code: "MAIN",
  timezone: "Asia/Amman",
  currency: "JOD",
};
const organization = { organizationId, name: "Example", timezone: "Asia/Amman" };

function company(scope: "ALL_LOCATIONS" | "LOCATION", selectedLocation = location) {
  return {
    authority: "COMPANY_ADMIN",
    context: {
      organization,
      scope: scope === "LOCATION"
        ? { kind: "LOCATION", locationId }
        : { kind: "ALL_LOCATIONS" },
      selectedLocation,
    },
  } as unknown as SelectedDashboardScope;
}

function render(scope: SelectedDashboardScope) {
  mocks.selected = scope;
  return renderToStaticMarkup(<StaffExceptionsBody />);
}

describe("Issue #428 staff Exceptions exact-Location boundary", () => {
  beforeEach(() => {
    mocks.locale = "en";
    mocks.apiCalls.length = 0;
    mocks.listTargets.length = 0;
    mocks.readCalls.length = 0;
    mocks.read.data = { overrides: {}, capabilities: { canReviewExceptions: true } };
    mocks.read.error = null;
    mocks.read.loading = false;
  });

  it("never mounts the API at Company all-Locations scope even if a stale location is present", () => {
    const html = render(company("ALL_LOCATIONS"));
    expect(html).toContain("Select an exact Location");
    expect(html).not.toContain("SCOPED_EXCEPTIONS_LIST");
    expect(mocks.apiCalls).toEqual([]);
    expect(mocks.readCalls).toEqual([]);
  });

  it("rejects a mismatched Company scope/selected-Location without any request", () => {
    mocks.locale = "ar";
    const html = render(company("LOCATION", { ...location, locationId: otherLocationId }));
    expect(html).toContain("اختر موقعًا محددًا");
    expect(mocks.apiCalls).toEqual([]);
    expect(mocks.readCalls).toEqual([]);
  });

  it.each([
    ["company", company("LOCATION")],
    ["manager", { authority: "LOCATION_MANAGER", organization, location } as SelectedDashboardScope],
  ] as const)("mounts the existing location-scoped list for %s", (_, scope) => {
    const html = render(scope);
    expect(html).toContain("SCOPED_EXCEPTIONS_LIST");
    expect(mocks.apiCalls).toEqual([false]);
    expect(mocks.listTargets).toEqual([scope]);
    expect(mocks.readCalls).toHaveLength(1);
  });

  it("hides the list during policy refresh and after a denied or failed authoritative read", () => {
    mocks.read.loading = true;
    expect(render(company("LOCATION"))).not.toContain("SCOPED_EXCEPTIONS_LIST");
    mocks.read.loading = false;
    mocks.read.error = new Error("revoked");
    const html = render(company("LOCATION"));
    expect(html).not.toContain("SCOPED_EXCEPTIONS_LIST");
    expect(html).toContain("role=\"alert\"");
  });
});
