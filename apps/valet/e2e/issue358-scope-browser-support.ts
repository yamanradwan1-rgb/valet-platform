import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, type Page, type Route } from "@playwright/test";

export const LOCATION_A = "11111111-1111-4111-8111-111111111111";
export const LOCATION_B = "22222222-2222-4222-8222-222222222222";
export const SESSION_A = "33333333-3333-4333-8333-333333333333";
const TASK_A = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const ORGANIZATION = "66666666-6666-4666-8666-666666666666";
const TOKEN = "vsa1.0123456789012345678901234567890123456789012";

export type AuthoritativeScope =
  "A" | "B" | "none" | "A-new-shift" | "A-new-membership";

export interface ScopeTrace {
  readonly context: AuthoritativeScope[];
  readonly session: Array<{
    scope: AuthoritativeScope;
    url: string;
    status: number;
  }>;
  readonly queues: string[];
  readonly endShifts: Array<{ scope: AuthoritativeScope; shiftId: string }>;
}

export interface ScopeHarness {
  scope: AuthoritativeScope;
  contextStatus: number | null;
  taskStatus: "IN_PROGRESS" | "ASSIGNED";
  releaseAccept: (() => void) | null;
  endShiftMode: "abort" | "hold" | "success";
  releaseEndShift: (() => void) | null;
  holdContext: boolean;
  releaseContext: (() => void) | null;
  allowRefresh: boolean;
  readonly trace: ScopeTrace;
}

const location = (id: string, name: string, code: string) => ({
  locationId: id,
  name,
  code,
  currency: "JOD",
  timezone: "Asia/Amman",
});

function contextFor(scope: AuthoritativeScope) {
  if (scope === "none") return { contexts: [] };
  const isA = scope !== "B";
  const id = isA ? LOCATION_A : LOCATION_B;
  const venue = isA ? "A" : "B";
  return {
    contexts: [
      {
        membershipId:
          scope === "A-new-membership"
            ? "99999999-9999-4999-8999-999999999999"
            : MEMBERSHIP,
        organization: { organizationId: ORGANIZATION, name: "QA Valet" },
        role: "VALET_EMPLOYEE",
        eligibleLocations: [location(id, `${venue} Hotel`, `LOC-${venue}`)],
        currentLocation: location(id, `${venue} Hotel`, `LOC-${venue}`),
        activeShift: {
          shiftId:
            scope === "A"
              ? "77777777-7777-4777-8777-777777777777"
              : scope === "B"
                ? "88888888-8888-4888-8888-888888888888"
                : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          locationId: id,
          status: "ACTIVE",
          startedAt: "2026-10-29T08:00:00.000Z",
        },
      },
    ],
  };
}

const aTask = {
  taskId: TASK_A,
  sessionId: SESSION_A,
  taskType: "RETRIEVAL",
  status: "IN_PROGRESS",
  currentAssigneeMembershipId: MEMBERSHIP,
  valetSessionState: "RETRIEVING",
  valetSessionVersion: 4,
  version: 3,
  createdAt: "2026-10-29T08:01:00.000Z",
  parkingZone: "QA Zone A",
  parkingSpot: "A-1",
  retrievalRequestedAt: "2026-10-29T08:02:00.000Z",
  vehicle: {
    make: "Toyota",
    model: "Corolla",
    color: "Blue",
    plateNumberRaw: "A-PLATE-358",
    temporaryDescriptor: null,
  },
};

async function replyJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function createScopeFixture(): Promise<{
  fixtureUrl: string;
  close: () => Promise<void>;
}> {
  const requireFromPackage = createRequire(`${process.cwd()}/package.json`);
  const viteEntry = createRequire(requireFromPackage.resolve("vitest")).resolve(
    "vite",
  );
  const { createServer } = await import(pathToFileURL(viteEntry).href);
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    esbuild: { jsx: "automatic", jsxImportSource: "react" },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  return {
    fixtureUrl: `${server.resolvedUrls?.local[0]}e2e/issue358-employee-browser-fixture.html`,
    close: () => server.close(),
  };
}

export async function mountScopedEmployee(page: Page, fixtureUrl: string) {
  const harness: ScopeHarness = {
    scope: "A",
    contextStatus: null,
    taskStatus: "IN_PROGRESS",
    releaseAccept: null,
    allowRefresh: false,
    endShiftMode: "success",
    releaseEndShift: null,
    holdContext: false,
    releaseContext: null,
    trace: { context: [], session: [], queues: [], endShifts: [] },
  };
  await page.route("**/v1/staff/auth/refresh", (route) =>
    harness.allowRefresh
      ? replyJson(route, {
          accessToken: "vsa1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
          tokenType: "Bearer",
          accessExpiresAt: "2028-01-02T00:00:00.000Z",
          sessionExpiresAt: "2028-02-01T00:00:00.000Z",
        })
      : route.fulfill({ status: 401 }),
  );
  await page.route("**/v1/staff/auth/login", (route) =>
    replyJson(route, {
      accessToken: TOKEN,
      tokenType: "Bearer",
      accessExpiresAt: "2028-01-01T00:00:00.000Z",
      sessionExpiresAt: "2028-02-01T00:00:00.000Z",
    }),
  );
  await page.route("**/v1/staff/auth/logout", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/v1/staff/operational-context", async (route) => {
    harness.trace.context.push(harness.scope);
    if (harness.holdContext) {
      await new Promise<void>((resolve) => {
        harness.releaseContext = resolve;
      });
    }
    if (harness.contextStatus !== null) {
      await replyJson(
        route,
        { message: "Temporary context failure" },
        harness.contextStatus,
      );
    } else {
      await replyJson(route, contextFor(harness.scope));
    }
  });
  await page.route("**/v1/staff/tasks/queue?**", async (route) => {
    const locationId = new URL(route.request().url()).searchParams.get(
      "locationId",
    );
    harness.trace.queues.push(locationId ?? "missing");
    await replyJson(route, {
      tasks:
        locationId === LOCATION_A
          ? [{ ...aTask, status: harness.taskStatus }]
          : [],
    });
  });
  await page.route(`**/v1/staff/tasks/${TASK_A}/accept`, async (route) => {
    await new Promise<void>((resolve) => {
      harness.releaseAccept = resolve;
    });
    await replyJson(route, {
      taskId: TASK_A,
      sessionId: SESSION_A,
      taskType: "RETRIEVAL",
      status: "ACCEPTED",
      currentAssigneeMembershipId: MEMBERSHIP,
      version: 4,
      createdAt: aTask.createdAt,
    });
  });
  await page.route("**/v1/staff/shifts/*/end", async (route) => {
    const shiftId = route.request().url().split("/").at(-2) ?? "missing";
    harness.trace.endShifts.push({ scope: harness.scope, shiftId });
    if (harness.endShiftMode === "abort") {
      await route.abort("failed");
      return;
    }
    if (harness.endShiftMode === "hold") {
      await new Promise<void>((resolve) => {
        harness.releaseEndShift = resolve;
      });
    }
    await replyJson(route, {
      shiftId,
      locationId: LOCATION_A,
      status: "ENDED",
      startedAt: "2026-10-29T08:00:00.000Z",
      endedAt: "2026-10-29T09:00:00.000Z",
      cashReconciliation: {
        cashExpected: "0",
        cashReported: "0",
        cashVariance: "0",
        currency: "JOD",
        reportedAt: "2026-10-29T09:00:00.000Z",
      },
    });
  });
  await page.route(`**/v1/staff/valet-sessions/${SESSION_A}`, async (route) => {
    // The server mock enforces the current authoritative scope. It never
    // grants A session data after the same login moved to B.
    const status = harness.scope === "A" ? 503 : 404;
    harness.trace.session.push({
      scope: harness.scope,
      url: route.request().url(),
      status,
    });
    await replyJson(
      route,
      { code: status === 404 ? "NOT_FOUND" : "UNAVAILABLE" },
      status,
    );
  });
  await page.goto(fixtureUrl);
  await page.locator('input[type="email"]').fill("scope@example.com");
  await page.locator('input[type="password"]').fill("Password123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("A Hotel").first()).toBeVisible();
  return harness;
}

export async function openRetainedARetrieval(page: Page): Promise<void> {
  await expect(page.getByText("A-PLATE-358").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue Retrieval" }).click();
  await expect(page.getByText("Cannot resume retrieval")).toBeVisible();
}

export async function refreshAuthoritativeScope(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}
