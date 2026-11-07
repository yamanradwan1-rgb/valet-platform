import { expect, test, type Page, type Request } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { locationPolicy, presenceException } from "./support/presence-fixtures";
import { shiftStartEndPosts, captureStaffRequests } from "./support/issue428-route-observation";

const scopeBase = (organizationId: string, locationId: string) =>
  `/v1/staff/management/organizations/${organizationId}/shift-presence/locations/${locationId}`;
const baseA = scopeBase(ORG_A.organizationId, LOCATION_A.locationId);
const baseB = scopeBase(ORG_B.organizationId, LOCATION_B.locationId);

const aException = {
  ...presenceException(),
  expiresAt: "2200-01-01T00:00:00.000Z",
};
const bException = {
  ...aException,
  exceptionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  locationId: LOCATION_B.locationId,
  requester: {
    ...aException.requester,
    userId: "99999999-9999-4999-8999-999999999999",
    membershipId: "88888888-8888-4888-8888-888888888888",
    firstName: "Bruno",
    lastName: "Santos",
    email: "bruno@example.com",
  },
};

type PresenceOverride = (
  path: string,
  request: Request,
) => Promise<{ readonly body: unknown } | undefined> | { readonly body: unknown } | undefined;

function scopedFixture(extra?: PresenceOverride) {
  const visited: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    companyLocations: {
      [ORG_A.organizationId]: [LOCATION_A],
      [ORG_B.organizationId]: [LOCATION_B],
    },
    override: async (path, request) => {
      const custom = await extra?.(path, request);
      if (custom) return custom;
      if (request.method() !== "GET") return undefined;
      if (path === `${baseA}/policy` || path === `${baseB}/policy`) {
        visited.push(path);
        const b = path === `${baseB}/policy`;
        return {
          body: {
            ...locationPolicy(),
            organizationId: b ? ORG_B.organizationId : ORG_A.organizationId,
            locationId: b ? LOCATION_B.locationId : LOCATION_A.locationId,
          },
        };
      }
      if (path === `${baseA}/exceptions` || path === `${baseB}/exceptions`) {
        visited.push(path);
        const items = new URL(request.url()).searchParams.get("view") === "PENDING"
          ? [path === `${baseB}/exceptions` ? bException : aException]
          : [];
        return { body: { items, nextCursor: null } };
      }
      return undefined;
    },
  });
  return { fixture, visited };
}

async function openEmployeesA(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/u);
  await page.getByRole("button", { name: "Exceptions", exact: true }).click();
  const section = page.getByTestId("presence-exceptions");
  await expect(section).toContainText("Nadia Salem");
  return section;
}

async function changeOrganization(page: Page, org: string, location: string) {
  await page.locator(".sidebar-scope").click();
  await page.getByRole("button", { name: org, exact: true }).click();
  await page.getByRole("button", { name: location, exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/u);
  await page.getByRole("button", { name: "Exceptions", exact: true }).click();
  return page.getByTestId("presence-exceptions");
}

async function flushReact(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test("mounted CA Exceptions isolates Organization A→B→A policy and Pending requester", async ({ page }) => {
  const allStaffRequests = captureStaffRequests(page);
  const { fixture, visited } = scopedFixture();
  const a = await openEmployeesA(page, fixture);
  await expect(a).not.toContainText("Bruno Santos");
  expect(visited).toContain(`${baseA}/policy`);
  expect(visited).toContain(`${baseA}/exceptions`);

  const b = await changeOrganization(page, ORG_B.name, LOCATION_B.name);
  await expect(b).toContainText("Bruno Santos");
  await expect(b).toContainText("bruno@example.com");
  await expect(b).not.toContainText("Nadia Salem");
  await expect(b).not.toContainText("nadia@example.com");
  expect(visited).toContain(`${baseB}/policy`);
  expect(visited).toContain(`${baseB}/exceptions`);
  expect(fixture.count(`${baseB}/policy`)).toBeGreaterThanOrEqual(1);
  expect(fixture.count(`${baseB}/exceptions`)).toBeGreaterThanOrEqual(1);

  const restored = await changeOrganization(page, ORG_A.name, LOCATION_A.name);
  await expect(restored).toContainText("Nadia Salem");
  await expect(restored).not.toContainText("Bruno Santos");
  expect(fixture.count(`${baseA}/exceptions`)).toBeGreaterThanOrEqual(2);
  expect(shiftStartEndPosts(allStaffRequests)).toEqual([]);
});

for (const releaseAt of ["B", "A"] as const) {
  test(`mounted CA ignores delayed org A Pending GET after release in org ${releaseAt}`, async ({ page }) => {
    let holdNextA = false;
    let heldRequest: Request | null = null;
    let signalStarted!: () => void;
    let release!: () => void;
    let handlerFinished!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const routeDone = new Promise<void>((resolve) => { handlerFinished = resolve; });
    const terminal = new Promise<void>((resolve) => {
      const onTerminal = (request: Request) => {
        if (request !== heldRequest) return;
        page.off("requestfinished", onTerminal);
        page.off("requestfailed", onTerminal);
        resolve();
      };
      page.on("requestfinished", onTerminal);
      page.on("requestfailed", onTerminal);
    });
    const { fixture, visited } = scopedFixture(async (path, request) => {
      if (holdNextA && path === `${baseA}/exceptions` && request.method() === "GET") {
        holdNextA = false;
        heldRequest = request;
        signalStarted();
        await held;
        handlerFinished();
        return {
          body: {
            items: [{ ...aException, requester: { ...aException.requester, firstName: "Stale" } }],
            nextCursor: null,
          },
        };
      }
      return undefined;
    });
    const a = await openEmployeesA(page, fixture);
    holdNextA = true;
    await a.getByRole("button", { name: "Refresh", exact: true }).click();
    await started;
    try {
      const b = await changeOrganization(page, ORG_B.name, LOCATION_B.name);
      await expect(b).toContainText("Bruno Santos");
      await expect(b).not.toContainText("Nadia Salem");
      await expect(b).not.toContainText("Stale Salem");
      if (releaseAt === "B") {
        release();
        await Promise.all([terminal, routeDone]);
        await flushReact(page);
        await expect(b).toContainText("Bruno Santos");
        await expect(b).not.toContainText("Stale Salem");
      }
      const restored = await changeOrganization(page, ORG_A.name, LOCATION_A.name);
      await expect(restored).toContainText("Nadia Salem");
      if (releaseAt === "A") {
        release();
        await Promise.all([terminal, routeDone]);
      }
      await flushReact(page);
      await expect(restored).toContainText("Nadia Salem");
      await expect(restored).not.toContainText("Stale Salem");
      await expect(restored).not.toContainText("Bruno Santos");
      expect(visited).toContain(`${baseB}/policy`);
      expect(visited).toContain(`${baseB}/exceptions`);
      expect(fixture.count(`${baseA}/exceptions`)).toBeGreaterThanOrEqual(3);
    } finally {
      release();
    }
  });
}
