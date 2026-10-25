import {
  managementGuestContactCompanyUpdateRequestSchema,
  managementGuestContactLocationUpdateRequestSchema,
  type GuestContactCompanyValues,
  type GuestContactLocationValues,
} from "@valet/contracts";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  type FixtureReply,
} from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import { expect, type Page } from "@playwright/test";

const root = `/v1/staff/management/organizations/${ORG_A.organizationId}`;
const companyRoot = `${root}/guest-information`;
const localRoot = `${root}/locations/${LOCATION_A.locationId}/guest-information`;
const time = "2026-10-25T09:00:00.000Z";
const inherit = { mode: "INHERIT", value: null } as const;
const fields = ["displayName", "phone", "supportUrl", "hours"] as const;

export function guestContactFixture() {
  const state = {
    companyRevision: 0,
    locationRevision: 0,
    nextStatus: null as number | null,
    puts: 0,
    company: {
      displayName: "Synthetic guest desk",
      phone: null,
      supportUrl: null,
      hours: null,
      hoursConfirmed: false,
    } as GuestContactCompanyValues,
    location: {
      displayName: inherit,
      phone: inherit,
      supportUrl: inherit,
      hours: inherit,
      hoursConfirmed: false,
    } as GuestContactLocationValues,
  };
  function error(status: number): FixtureReply {
    const code =
      status === 409
        ? "CONFIGURATION_CONFLICT"
        : status === 403
          ? "AUTHORIZATION_DENIED"
          : status === 400
            ? "REQUEST_INVALID"
            : "INTERNAL_ERROR";
    return {
      status,
      body: { code, message: code, requestId: "synthetic-contact" },
    };
  }
  const company = () => ({
    organizationId: ORG_A.organizationId,
    revision: state.companyRevision,
    updatedAt: state.companyRevision ? time : null,
    values: state.company,
  });
  function effective() {
    return Object.fromEntries(
      fields.map((field) => {
        const local = state.location[field];
        const source =
          local.mode === "INHERIT"
            ? "COMPANY"
            : local.mode === "OVERRIDE"
              ? "LOCATION"
              : "UNAVAILABLE";
        let value =
          local.mode === "INHERIT"
            ? state.company[field]
            : local.mode === "OVERRIDE"
              ? local.value
              : null;
        if (
          field === "hours" &&
          !(local.mode === "INHERIT"
            ? state.company.hoursConfirmed
            : state.location.hoursConfirmed)
        )
          value = null;
        return [field, { source, value }];
      }),
    );
  }
  const location = () => ({
    organizationId: ORG_A.organizationId,
    locationId: LOCATION_A.locationId,
    revision: state.locationRevision,
    updatedAt: state.locationRevision ? time : null,
    values: state.location,
    effective: effective(),
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: "ASSURED",
    override: (path, request) => {
      if (path === `${companyRoot}/overview`)
        return {
          body: {
            companyName: ORG_A.name,
            locations: [
              {
                id: LOCATION_A.locationId,
                name: LOCATION_A.name,
                privacy: "NOT_SET",
                contact: state.company.phone ? "AVAILABLE" : "NOT_SET",
              },
            ],
            publishedCount: 0,
          },
        };
      if (path === `${localRoot}/privacy`)
        return {
          body: {
            organizationId: ORG_A.organizationId,
            locationId: LOCATION_A.locationId,
            revision: 0,
            updatedAt: null,
            drafts: { en: { text: "", url: "" }, ar: { text: "", url: "" } },
            published: null,
            publishedVersion: null,
            publishedAt: null,
          },
        };
      if (path === `${localRoot}/preview`)
        return {
          body: {
            locale: new URL(request.url()).searchParams.get("locale") ?? "en",
            privacy: {
              status: "UNAVAILABLE",
              text: null,
              url: null,
              version: null,
              publishedAt: null,
            },
            contact: Object.fromEntries(
              fields.map((field) => [field, effective()[field]?.value ?? null]),
            ),
          },
        };
      const isCompany = path === `${companyRoot}/contact/defaults`;
      if (!isCompany && path !== `${localRoot}/contact`) return undefined;
      if (request.method() === "GET")
        return { body: isCompany ? company() : location() };
      if (request.method() !== "PUT") return error(400);
      state.puts++;
      if (state.nextStatus !== null) {
        const status = state.nextStatus;
        state.nextStatus = null;
        return error(status);
      }
      if (isCompany) {
        const parsed =
          managementGuestContactCompanyUpdateRequestSchema.safeParse(
            request.postDataJSON(),
          );
        if (!parsed.success) return error(400);
        if (parsed.data.expectedRevision !== state.companyRevision)
          return error(409);
        state.company = structuredClone(parsed.data.values);
        state.companyRevision++;
        return { body: company() };
      }
      const parsed =
        managementGuestContactLocationUpdateRequestSchema.safeParse(
          request.postDataJSON(),
        );
      if (!parsed.success) return error(400);
      if (parsed.data.expectedRevision !== state.locationRevision)
        return error(409);
      state.location = structuredClone(parsed.data.values);
      state.locationRevision++;
      return { body: location() };
    },
  });
  return { fixture, state };
}

export async function enterGuestContact(
  page: Page,
  fixture: DashboardApiFixture,
) {
  await fixture.install(page);
  await page.goto("/help");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await expect(page.locator("header .location-context-value")).toHaveText(LOCATION_A.name);
  await page.goto("/guest-information");
  await page.locator('[data-view-target="contact"]').click();
}
