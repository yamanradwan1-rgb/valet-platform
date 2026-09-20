import type { Page, Request, Route } from "@playwright/test";

import {
  authPayload,
  E2E_IDS,
  enrollmentPayload,
  LOCATION_A,
  ORG_A,
  recoveryCodes,
  subscriptionState,
  type Location,
  type Organization,
} from "./fixture-data";

export {
  E2E_IDS,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
  RECOVERY_CODE,
} from "./fixture-data";

const COOKIE_NAME = "vaylet_e2e_refresh";
const COOKIE_VALUE = "fixture";
type MfaState =
  "ENROLLMENT_REQUIRED" | "ENROLLMENT_PENDING" | "STEP_UP_REQUIRED" | "ASSURED";

export interface FixtureReply {
  readonly status?: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly delayMs?: number;
}

export interface DashboardFixtureOptions {
  readonly companyOrganizations?: readonly Organization[];
  readonly locationManagerOrganizations?: readonly Organization[];
  readonly companyLocations?: Readonly<Record<string, readonly Location[]>>;
  readonly locationManagerLocations?: Readonly<
    Record<string, readonly Location[]>
  >;
  readonly operationalContexts?: readonly unknown[];
  readonly managementRequiresMfa?: boolean;
  readonly mfaState?: MfaState;
  readonly override?: (
    path: string,
    request: Request,
    fixture: DashboardApiFixture,
  ) => FixtureReply | undefined | Promise<FixtureReply | undefined>;
}

export class DashboardApiFixture {
  readonly counts = new Map<string, number>();
  readonly loginBodies: unknown[] = [];
  refreshCookieSeen = false;
  mfaAssured = false;
  mfaState: MfaState;

  constructor(private readonly options: DashboardFixtureOptions = {}) {
    this.mfaState = options.mfaState ?? "ASSURED";
    this.mfaAssured = this.mfaState === "ASSURED";
  }

  count(path: string): number {
    return this.counts.get(path) ?? 0;
  }

  async install(page: Page): Promise<void> {
    await page.route("**/v1/staff/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      this.counts.set(path, this.count(path) + 1);

      const custom = await this.options.override?.(path, request, this);
      if (custom !== undefined) {
        await fulfill(route, custom);
        return;
      }
      await fulfill(route, this.defaultReply(path, url, request));
    });
  }

  private defaultReply(path: string, url: URL, request: Request): FixtureReply {
    if (path === "/v1/staff/auth/login") {
      this.loginBodies.push(request.postDataJSON());
      return {
        body: authPayload("A"),
        headers: {
          "set-cookie": `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/; HttpOnly; SameSite=Lax`,
        },
      };
    }
    if (path === "/v1/staff/auth/refresh") {
      const hasCookie =
        request.headers().cookie?.includes(`${COOKIE_NAME}=${COOKIE_VALUE}`) ===
        true;
      this.refreshCookieSeen ||= hasCookie;
      return hasCookie
        ? { body: authPayload("B") }
        : errorReply(401, "STAFF_AUTHENTICATION_REQUIRED");
    }
    if (path === "/v1/staff/auth/logout") {
      return {
        body: {},
        headers: {
          "set-cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
        },
      };
    }
    if (path === "/v1/staff/auth/mfa/state")
      return { body: { state: this.mfaState } };
    if (path === "/v1/staff/auth/mfa/enrollment/begin") {
      this.mfaState = "ENROLLMENT_PENDING";
      return { body: enrollmentPayload() };
    }
    if (path === "/v1/staff/auth/mfa/enrollment/confirm") {
      this.mfaState = "ASSURED";
      this.mfaAssured = true;
      return { body: { recoveryCodes: recoveryCodes() } };
    }
    if (path === "/v1/staff/auth/mfa/step-up") {
      this.mfaState = "ASSURED";
      this.mfaAssured = true;
      return { body: { state: "ASSURED" } };
    }
    if (path === "/v1/staff/auth/mfa/recovery/begin") {
      this.mfaState = "ENROLLMENT_PENDING";
      return { body: enrollmentPayload() };
    }
    if (path === "/v1/staff/auth/mfa/recovery-codes/reissue") {
      return {
        body: { factorId: E2E_IDS.factor, recoveryCodes: recoveryCodes() },
      };
    }
    if (path === "/v1/staff/management/organizations") {
      if (this.options.managementRequiresMfa && !this.mfaAssured) {
        return errorReply(403, "MFA_STEP_UP_REQUIRED");
      }
      return pageReply(this.options.companyOrganizations ?? []);
    }
    if (path === "/v1/staff/dashboard/organizations") {
      return pageReply(this.options.locationManagerOrganizations ?? []);
    }
    if (path === "/v1/staff/operational-context") {
      return { body: { contexts: this.options.operationalContexts ?? [] } };
    }

    const managementLocations = path.match(
      /^\/v1\/staff\/management\/organizations\/([^/]+)\/locations$/u,
    );
    if (managementLocations) {
      return pageReply(
        this.options.companyLocations?.[managementLocations[1]!] ?? [],
      );
    }
    const dashboardLocations = path.match(
      /^\/v1\/staff\/dashboard\/organizations\/([^/]+)\/locations$/u,
    );
    if (dashboardLocations) {
      return pageReply(
        this.options.locationManagerLocations?.[dashboardLocations[1]!] ?? [],
      );
    }
    const subscription = path.match(
      /^\/v1\/staff\/management\/organizations\/([^/]+)\/subscription$/u,
    );
    if (subscription)
      return { body: organizationSubscription(subscription[1]!) };

    const locationSubscription = path.match(
      /^\/v1\/staff\/dashboard\/locations\/([^/]+)\/subscription$/u,
    );
    if (locationSubscription) {
      const locationId = locationSubscription[1]!;
      return {
        body: locationSubscriptionPayload(
          this.findOrganizationForLocation(locationId),
          locationId,
        ),
      };
    }

    const context = path.match(
      /^\/v1\/staff\/management\/organizations\/([^/]+)\/context$/u,
    );
    if (context) return { body: this.contextPayload(context[1]!, url) };
    return errorReply(404, "AUTHORIZATION_DENIED");
  }

  private contextPayload(organizationId: string, url: URL): unknown {
    const organization = this.findOrganization(organizationId);
    const scopeKind = url.searchParams.get("scopeKind");
    if (scopeKind === "LOCATION") {
      const locationId = url.searchParams.get("locationId") ?? "";
      const location = this.findLocation(organizationId, locationId);
      return {
        organization,
        scope: { kind: "LOCATION", locationId },
        selectedLocation: location,
        capabilities: ["LOCATION_DASHBOARD_READ"],
      };
    }
    return {
      organization,
      scope: { kind: "ALL_LOCATIONS" },
      selectedLocation: null,
      capabilities: ["COMPANY_DASHBOARD_READ", "ALL_LOCATIONS_SCOPE_SELECT"],
    };
  }

  private findOrganization(id: string): Organization {
    const all = [
      ...(this.options.companyOrganizations ?? []),
      ...(this.options.locationManagerOrganizations ?? []),
    ];
    return (
      all.find((organization) => organization.organizationId === id) ?? ORG_A
    );
  }

  private findLocation(organizationId: string, locationId: string): Location {
    const all = [
      ...(this.options.companyLocations?.[organizationId] ?? []),
      ...(this.options.locationManagerLocations?.[organizationId] ?? []),
    ];
    return (
      all.find((location) => location.locationId === locationId) ?? LOCATION_A
    );
  }

  private findOrganizationForLocation(locationId: string): string {
    for (const [organizationId, locations] of Object.entries(
      this.options.locationManagerLocations ?? {},
    )) {
      if (locations.some((location) => location.locationId === locationId))
        return organizationId;
    }
    return ORG_A.organizationId;
  }
}

export function supervisorContext() {
  const operationalLocation = {
    code: LOCATION_A.code,
    currency: LOCATION_A.currency,
    locationId: LOCATION_A.locationId,
    name: LOCATION_A.name,
  };
  return {
    activeShift: {
      locationId: LOCATION_A.locationId,
      shiftId: E2E_IDS.shift,
      startedAt: "2026-09-20T00:00:00Z",
      status: "ACTIVE",
    },
    currentLocation: operationalLocation,
    eligibleLocations: [operationalLocation],
    membershipId: E2E_IDS.membership,
    organization: { organizationId: ORG_A.organizationId, name: ORG_A.name },
    role: "VALET_SUPERVISOR",
  };
}

export function employeeContext() {
  return { ...supervisorContext(), role: "VALET_EMPLOYEE" };
}

function pageReply(items: readonly unknown[]): FixtureReply {
  return { body: { items, nextCursor: null } };
}

function organizationSubscription(organizationId: string) {
  return { organizationId, subscription: subscriptionState() };
}

function locationSubscriptionPayload(
  organizationId: string,
  locationId: string,
) {
  return { organizationId, locationId, subscription: subscriptionState() };
}

function errorReply(status: number, code: string): FixtureReply {
  return { status, body: { code, message: code, requestId: `e2e-${status}` } };
}

async function fulfill(route: Route, reply: FixtureReply): Promise<void> {
  if (reply.delayMs)
    await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
  await route
    .fulfill({
      status: reply.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(reply.body),
      headers: reply.headers,
    })
    .catch(() => undefined);
}
