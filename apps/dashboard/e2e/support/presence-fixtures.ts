import type { Page, Request } from "@playwright/test";
import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  type FixtureReply,
} from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import {
  companySettings,
  managementLocationSettings,
} from "./administration-fixtures";

export {
  ZONE_ID,
  EXCEPTION_ID,
  lmBase,
  caBase,
  companyBase,
  companyPolicy,
  locationPolicy,
  attendanceZone,
  presenceException,
} from "./presence-data";
import {
  ZONE_ID,
  EXCEPTION_ID,
  companyBase,
  companyPolicy,
  locationPolicy,
  attendanceZone,
  presenceException,
} from "./presence-data";

export class PresenceFixture {
  policy = locationPolicy();
  company = companyPolicy();
  zones = [attendanceZone()];
  exceptions = [presenceException()];
  writes: { path: string; body: Record<string, unknown> }[] = [];
  requests: string[] = [];
  readonly fixture: DashboardApiFixture;
  constructor(
    readonly authority: "LM" | "CA" = "LM",
    override?: (
      path: string,
      request: Request,
      state: PresenceFixture,
    ) => FixtureReply | undefined | Promise<FixtureReply | undefined>,
  ) {
    this.fixture = new DashboardApiFixture({
      ...(authority === "CA"
        ? {
            companyOrganizations: [ORG_A],
            companyLocations: { [E2E_IDS.orgA]: [LOCATION_A, LOCATION_B] },
          }
        : {
            locationManagerOrganizations: [ORG_A],
            locationManagerLocations: {
              [E2E_IDS.orgA]: [LOCATION_A, LOCATION_B],
            },
          }),
      override: async (path, request) => {
        if (
          path === `/v1/staff/management/organizations/${E2E_IDS.orgA}/settings`
        )
          return { body: companySettings() };
        if (
          path ===
          `/v1/staff/management/organizations/${E2E_IDS.orgA}/locations/${E2E_IDS.locationA}/settings`
        )
          return { body: managementLocationSettings() };
        if (!path.includes("/shift-presence"))
          return path.startsWith("/v1/staff/auth/")
            ? override?.(path, request, this)
            : undefined;
        this.requests.push(request.url());
        if (request.method() !== "GET")
          this.writes.push({ path, body: request.postDataJSON() });
        const custom = await override?.(path, request, this);
        if (custom) return custom;
        return this.reply(path, request);
      },
    });
  }
  async open(page: Page, company = false) {
    await this.fixture.install(page);
    await page.goto("/policies");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
    await page
      .getByRole("button", { name: LOCATION_A.name, exact: true })
      .click();
    if (this.authority === "CA" && !company)
      await page.getByRole("tab", { name: "Location Overrides" }).click();
  }
  private reply(path: string, request: Request): FixtureReply {
    const company = path.startsWith(`${companyBase}/policy`);
    if (path.endsWith("/policy") && request.method() === "GET")
      return { body: company ? this.company : this.policy };
    if (path.endsWith("/zones") && request.method() === "GET")
      return { body: { items: this.zones, nextCursor: null } };
    if (path.endsWith(`/zones/${ZONE_ID}`) && request.method() === "GET")
      return {
        body: { zone: this.zones[0], readiness: this.policy.readiness },
      };
    if (path.endsWith("/exceptions")) {
      const history =
        new URL(request.url()).searchParams.get("view") === "HISTORY";
      return {
        body: {
          items: this.exceptions.filter((e) =>
            history ? e.status !== "PENDING" : e.status === "PENDING",
          ),
          nextCursor: null,
        },
      };
    }
    if (path.endsWith(`/exceptions/${EXCEPTION_ID}`))
      return { body: this.exceptions[0] };
    if (path.endsWith("/approve") || path.endsWith("/reject")) {
      this.exceptions[0] = {
        ...this.exceptions[0]!,
        status: path.endsWith("/approve") ? "APPROVED" : "REJECTED",
        revision: 2,
        reviewedAt: new Date().toISOString(),
        canReview: false,
      };
      return { body: this.exceptions[0] };
    }
    const body = request.method() !== "GET" ? request.postDataJSON() : {};
    if (path.includes("/policy/")) {
      const mapping = {
        shiftStartPresenceMode: ["startMode", "startModeOverride"],
        shiftEndPresenceMode: ["endMode", "endModeOverride"],
        shiftPresenceMaxAccuracyMeters: [
          "maxAccuracyMeters",
          "maxAccuracyMetersOverride",
        ],
        shiftPresenceMaxFixAgeSeconds: [
          "maxFixAgeSeconds",
          "maxFixAgeSecondsOverride",
        ],
      } as const;
      const keys = mapping[body.field as keyof typeof mapping];
      if (company) {
        this.company = {
          ...this.company,
          policy: {
            ...this.company.policy,
            [keys[0]]: body.value,
            revision: this.company.policy.revision + 1,
          },
        };
        return { body: this.company };
      }
      const clear = path.endsWith("/clear");
      this.policy = {
        ...this.policy,
        overrides: {
          ...this.policy.overrides,
          [keys[1]]: clear ? null : body.value,
          revision: this.policy.overrides.revision + 1,
        },
        effective: {
          ...this.policy.effective,
          [keys[0]]: clear ? this.policy.company[keys[0]] : body.value,
        },
        readiness: {
          ...this.policy.readiness,
          locationRevision: this.policy.overrides.revision + 1,
          configurationFingerprint: "b".repeat(64),
        },
      };
      return { body: this.policy };
    }
    if (path.includes("/zones") && request.method() !== "GET") {
      const zone = {
        ...attendanceZone(),
        ...body,
        id: body.zoneId ?? ZONE_ID,
        revision: path.endsWith("/zones") ? 1 : 2,
      };
      delete zone.mutationId;
      delete zone.zoneId;
      delete zone.expectedRevision;
      this.zones = [zone];
      return { body: { zone, readiness: this.policy.readiness } };
    }
    return {
      status: 404,
      body: { code: "PRESENCE_SCOPE_DENIED", message: "Not authorized" },
    };
  }
}

export async function fillZone(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Add Attendance Zone" });
  for (const [label, value] of Object.entries({
    Label: "South entrance",
    Code: "SOUTH",
    Latitude: "0",
    Longitude: "0",
    "Radius (meters)": "35.5",
  }))
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByLabel("Status", { exact: true }).selectOption("ACTIVE");
  return dialog;
}
