import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  type FixtureReply,
} from "./dashboard-api-fixture";
import { openLocationManagerWorkspace } from "./foundation-ui";

type InitialMfaState =
  "ENROLLMENT_REQUIRED" | "ENROLLMENT_PENDING" | "STEP_UP_REQUIRED" | "ASSURED";
type ReadFailure = "DENIED" | "UNAVAILABLE" | "MALFORMED" | "UNAUTHENTICATED";

export const guestRoot =
  "/v1/staff/management/organizations/" + ORG_A.organizationId;
export const overviewPath = guestRoot + "/guest-information/overview";

export function guestPaths(locationId = LOCATION_A.locationId) {
  const base = guestRoot + "/locations/" + locationId + "/guest-information";
  return {
    privacy: base + "/privacy",
    contact: base + "/contact",
    preview: base + "/preview",
  };
}

export function issue409GuestMfaFixture(mfaState: InitialMfaState) {
  const state = {
    readFailure: null as ReadFailure | null,
    denyAfterAssurance: false,
    denyWrites: false,
    writes: 0,
    lastWriteExpectedRevision: null as number | null,
    privacyRevision: 0,
    contactRevision: 0,
    readPaths: [] as string[],
    readBarrier: null as null | { path: string; wait: Promise<void> },
  };
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
    },
    mfaState,
    override: async (path, request, auth) => {
      if (path !== overviewPath && !path.startsWith(guestRoot + "/locations/"))
        return undefined;
      if (!path.includes("/guest-information/")) return undefined;

      if (request.method() === "PUT" || request.method() === "POST") {
        state.writes++;
        const payload = request.postDataJSON() as {
          expectedRevision?: unknown;
        } | null;
        state.lastWriteExpectedRevision =
          typeof payload?.expectedRevision === "number"
            ? payload.expectedRevision
            : null;
        return state.denyWrites
          ? failure(403, "MFA_STEP_UP_REQUIRED")
          : failure(400, "REQUEST_INVALID");
      }
      if (request.method() !== "GET") return failure(405, "REQUEST_INVALID");
      state.readPaths.push(path);
      if (state.readBarrier?.path === path) await state.readBarrier.wait;
      if (state.readFailure === "DENIED")
        return failure(403, "AUTHORIZATION_DENIED");
      if (state.readFailure === "UNAVAILABLE")
        return failure(503, "UNAVAILABLE");
      if (state.readFailure === "UNAUTHENTICATED")
        return failure(401, "STAFF_AUTHENTICATION_REQUIRED");
      if (state.readFailure === "MALFORMED") return { body: { wrong: true } };
      if (!auth.mfaAssured || state.denyAfterAssurance)
        return failure(403, "MFA_STEP_UP_REQUIRED");

      if (path === overviewPath) return { body: overview() };
      for (const location of [LOCATION_A, LOCATION_B]) {
        const paths = guestPaths(location.locationId);
        if (path === paths.privacy)
          return { body: privacy(location.locationId, state.privacyRevision) };
        if (path === paths.contact)
          return { body: contact(location.locationId, state.contactRevision) };
        if (path === paths.preview)
          return {
            body: preview(
              location.locationId,
              new URL(request.url()).searchParams.get("locale") ?? "en",
            ),
          };
      }
      return failure(404, "AUTHORIZATION_DENIED");
    },
  });
  return { fixture, state };
}

export async function enterIssue409GuestPage(
  page: Page,
  fixture: DashboardApiFixture,
) {
  await fixture.install(page);
  await openLocationManagerWorkspace(page);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto("/guest-information");
}

export async function denyNextPreviewWithMfa(page: Page) {
  let challenged = false;
  await page.route("**" + guestPaths().preview + "*", async (route) => {
    if (challenged) return route.fallback();
    challenged = true;
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        code: "MFA_STEP_UP_REQUIRED",
        message: "MFA step-up required",
        requestId: "issue409-draft-red",
      }),
    });
  });
  return () => challenged;
}

export async function completeIssue409StepUp(page: Page) {
  const code = page.locator("#mfa-totp-mfaVerify");
  await expect(code).toBeVisible();
  await code.fill("123456");
  await page
    .locator("form:has(#mfa-totp-mfaVerify) button[type=submit]")
    .click();
  await expect(page).toHaveURL(/\/guest-information$/u);
  await expect(code).toHaveCount(0);
  await page.getByRole("button", { name: "اللغة", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Privacy & Contact" }),
  ).toBeVisible();
}

export async function showGuestPreview(page: Page) {
  await page.locator('[data-view-target="contact"]').click();
  await page.locator("[data-guest-preview] > summary").click();
  await expect(page.locator('[data-widget="preview"]')).toBeVisible();
}

export function previewMarker(locationId = LOCATION_A.locationId) {
  return locationId === LOCATION_A.locationId
    ? "ISSUE409_GUEST_A"
    : "ISSUE409_GUEST_B";
}

function overview() {
  return {
    companyName: ORG_A.name,
    locations: [LOCATION_A, LOCATION_B].map((location) => ({
      id: location.locationId,
      name: location.name,
      privacy: "NOT_SET",
      contact: "AVAILABLE",
    })),
    publishedCount: 0,
  };
}

function privacy(locationId: string, revision = 0) {
  return {
    organizationId: ORG_A.organizationId,
    locationId,
    revision,
    updatedAt: null,
    drafts: {
      en: { text: revision ? "Updated elsewhere" : "", url: "" },
      ar: { text: "", url: "" },
    },
    published: null,
    publishedVersion: null,
    publishedAt: null,
  };
}

function contact(locationId: string, revision = 0) {
  const inherit = { mode: "INHERIT", value: null };
  return {
    organizationId: ORG_A.organizationId,
    locationId,
    revision,
    updatedAt: null,
    values: {
      displayName: inherit,
      phone: revision ? { mode: "OVERRIDE", value: "+962799999888" } : inherit,
      supportUrl: inherit,
      hours: inherit,
      hoursConfirmed: false,
    },
    effective: {
      displayName: { source: "COMPANY", value: previewMarker(locationId) },
      phone: revision
        ? { source: "LOCATION", value: "+962799999888" }
        : { source: "COMPANY", value: null },
      supportUrl: { source: "COMPANY", value: null },
      hours: { source: "COMPANY", value: null },
    },
  };
}

function preview(locationId: string, locale: string) {
  return {
    locale,
    privacy: {
      status: "UNAVAILABLE",
      text: null,
      url: null,
      version: null,
      publishedAt: null,
    },
    contact: {
      displayName: previewMarker(locationId),
      phone: null,
      supportUrl: null,
      hours: null,
    },
  };
}

function failure(status: number, code: string): FixtureReply {
  return {
    status,
    body: { code, message: code, requestId: "issue409-e2e-" + status },
  };
}
