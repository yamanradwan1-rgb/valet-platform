import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterLocations,
  lifecyclePath,
  locationLifecycle,
  selectLocation,
  locationsPath,
} from "./support/r06-locations";

test("#346 confirms explicit Resume, pending state, authoritative refresh and restored Stop; never resumes on load", async ({
  page,
}) => {
  let current = locationLifecycle({
    status: "ACTIVE",
    drain: {
      blocked: true,
      activeShiftPresent: true,
      nonCompletedValetSessionPresent: false,
      nonTerminalTaskPresent: false,
    },
  });
  const writes: string[] = [];
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path, request) => {
      if (path === lifecyclePath) return { body: current };
      if (path.endsWith("/resume-intake")) {
        writes.push(path);
        expect(request.postDataJSON()).toEqual({
          expectedUpdatedAt: current.updatedAt,
        });
        await blocked;
        current = {
          ...current,
          acceptingIntake: true,
          updatedAt: "2026-10-26T00:00:00.000Z",
        };
        return { status: 201, body: current };
      }
      return undefined;
    },
  }).install(page);
  await enterLocations(page);
  await selectLocation(page);
  expect(writes).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Deactivate", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Resume Intake", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Resume Intake",
    exact: true,
  });
  await expect(dialog).toContainText(
    "Existing shifts and operational work will continue",
  );
  expect(writes).toHaveLength(0);
  await dialog
    .getByRole("button", { name: "Resume Intake", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Resume Intake", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("status")).toHaveText("Loading…");
  release!();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Stop intake", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume Intake", exact: true }),
  ).toHaveCount(0);
  expect(writes).toHaveLength(1);
});

for (const status of [403, 409, 500]) {
  test(`#346 status ${status} retains confirmation and displays existing error feedback`, async ({
    page,
  }) => {
    let current = locationLifecycle({ status: "ACTIVE" });
    await new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) => {
        if (path === lifecyclePath) return { body: current };
        if (path.endsWith("/resume-intake")) {
          if (status === 409)
            current = { ...current, updatedAt: "2026-10-26T00:00:01.000Z" };
          return {
            status,
            body: {
              code:
                status === 409
                  ? "LOCATION_LIFECYCLE_CONFLICT"
                  : "AUTHORIZATION_DENIED",
              message: "Rejected",
              requestId: "synthetic-346",
            },
          };
        }
        return undefined;
      },
    }).install(page);
    await enterLocations(page);
    await selectLocation(page);
    await page
      .getByRole("button", { name: "Resume Intake", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Resume Intake" });
    await dialog
      .getByRole("button", { name: "Resume Intake", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Stop intake", exact: true }),
    ).toHaveCount(0);
  });
}

test("#346 delayed Resume from a previous selection cannot overwrite another Location", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const a = locationLifecycle({ status: "ACTIVE" });
  const b = locationLifecycle({ ...LOCATION_B, status: "INACTIVE" });
  await new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: async (path) => {
      if (path === locationsPath) return { body: { items: [LOCATION_A, LOCATION_B], nextCursor: null } };
      if (path === lifecyclePath) return { body: a };
      if (path === `${locationsPath}/${LOCATION_B.locationId}/lifecycle`)
        return { body: b };
      if (path.endsWith("/resume-intake")) {
        await blocked;
        return { status: 201, body: { ...a, acceptingIntake: true } };
      }
      return undefined;
    },
  }).install(page);
  await enterLocations(page);
  await selectLocation(page);
  await page
    .getByRole("button", { name: "Resume Intake", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resume Intake", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await selectLocation(page, LOCATION_B.name);
  release!();
  await expect(
    page.getByRole("heading", { name: LOCATION_B.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Activate", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop intake", exact: true }),
  ).toHaveCount(0);
});
