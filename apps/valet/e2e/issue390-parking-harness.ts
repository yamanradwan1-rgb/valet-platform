import { expect, type Page, type Route } from "@playwright/test";

export const SESSION_A = "11111111-1111-4111-8111-111111111111";
export const SESSION_B = "22222222-2222-4222-8222-222222222222";
export const TASK_A = "33333333-3333-4333-8333-333333333333";
const TASK_B = "44444444-4444-4444-8444-444444444444";
const LOCATION = "55555555-5555-4555-8555-555555555555";
const MEMBERSHIP = "66666666-6666-4666-8666-666666666666";
const ORG = "77777777-7777-4777-8777-777777777777";
const SHIFT = "88888888-8888-4888-8888-888888888888";
const VEHICLE = "99999999-9999-4999-8999-999999999999";
const DATE = "2026-10-30T08:00:00.000Z";

export interface ParkingHarness {
  scope: "original" | "changed";
  hydrateMode: "success" | "failure";
  releaseStart: (() => void) | null;
  releaseHydrate: (() => void) | null;
  readonly confirmations: Array<{ sessionId: string; body: Record<string, unknown> }>;
  readonly requests: string[];
}

function respond(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

const car = (plate: string) => ({
  color: "Silver",
  make: "Toyota",
  model: "Corolla",
  plateCountry: "JO",
  plateNumberRaw: plate,
  temporaryDescriptor: null,
  vehicleId: VEHICLE,
  vehicleUpdatedAt: DATE,
});

const queueTask = {
  taskId: TASK_A,
  sessionId: SESSION_A,
  taskType: "PARKING",
  status: "IN_PROGRESS",
  currentAssigneeMembershipId: MEMBERSHIP,
  valetSessionState: "PARKING",
  valetSessionVersion: 6,
  version: 9,
  createdAt: DATE,
  parkingZone: "North",
  parkingSpot: null,
  retrievalRequestedAt: null,
  vehicle: {
    make: "Toyota",
    model: "Corolla",
    color: "Silver",
    plateNumberRaw: "A-PLATE-390",
    temporaryDescriptor: null,
  },
};

const taskB = (status: string, version: number, assignee: string | null) => ({
  taskId: TASK_B,
  sessionId: SESSION_B,
  taskType: "PARKING",
  status,
  currentAssigneeMembershipId: assignee,
  version,
  createdAt: DATE,
});

const startB = {
  parkingStartedAt: DATE,
  sessionId: SESSION_B,
  sessionVersion: 3,
  state: "PARKING",
  taskId: TASK_B,
  taskStatus: "IN_PROGRESS",
  taskVersion: 4,
};

export async function mountParkingHarness(
  page: Page,
  fixtureUrl: string,
): Promise<ParkingHarness> {
  const harness: ParkingHarness = {
    scope: "original",
    hydrateMode: "success",
    releaseStart: null,
    releaseHydrate: null,
    confirmations: [],
    requests: [],
  };
  page.on("request", (request) => {
    if (request.url().includes("/v1/staff/")) harness.requests.push(request.url());
  });
  const watch = (route: Route) => {
    harness.requests.push(route.request().url());
  };
  await page.route("**/v1/staff/auth/refresh", (route) =>
    route.fulfill({ status: 401 }));
  await page.route("**/v1/staff/auth/login", (route) => respond(route, {
    accessToken: "vsa1.0123456789012345678901234567890123456789012",
    tokenType: "Bearer",
    accessExpiresAt: "2028-01-01T00:00:00.000Z",
    sessionExpiresAt: "2028-02-01T00:00:00.000Z",
  }));
  await page.route("**/v1/staff/auth/logout", (route) =>
    route.fulfill({ status: 204 }));
  await page.route("**/v1/staff/operational-context", (route) => {
    const changed = harness.scope === "changed";
    const currentLocation = {
      locationId: changed ? SESSION_B : LOCATION,
      name: changed ? "Other Hotel" : "Original Hotel",
      code: changed ? "LOC-B" : "LOC-A",
      currency: "JOD",
      timezone: "Asia/Amman",
    };
    return respond(route, { contexts: [{
      membershipId: changed ? SESSION_B : MEMBERSHIP,
      organization: { organizationId: ORG, name: "Fixture Organization" },
      role: "VALET_EMPLOYEE",
      eligibleLocations: [currentLocation],
      currentLocation,
      activeShift: {
        shiftId: changed ? TASK_B : SHIFT,
        locationId: currentLocation.locationId,
        status: "ACTIVE",
        startedAt: DATE,
      },
    }] });
  });
  await page.route("**/v1/staff/tasks/queue?**", (route) => {
    watch(route);
    return respond(route, {
      tasks: harness.scope === "original" ? [queueTask] : [],
    });
  });
  await page.route("**/v1/staff/check-in/drafts?**", (route) =>
    respond(route, { drafts: [] }));
  await page.route("**/v1/staff/check-in/continuations?**", (route) =>
    respond(route, { continuations: [] }));
  await page.route("**/v1/staff/check-in/vehicle-recognition", (route) =>
    respond(route, { vehicle: null }));
  await page.route("**/v1/staff/check-in/intakes", (route) => respond(route, {
    createdAt: DATE,
    color: null,
    customerId: TASK_B,
    make: null,
    model: null,
    state: "CHECKING_IN",
    valetSessionId: SESSION_B,
    vehicleId: VEHICLE,
    vehicleUpdatedAt: DATE,
    version: 1,
  }));
  await page.route(`**/v1/staff/check-in/sessions/${SESSION_B}/condition-notes`,
    (route) => respond(route, {
      conditionNoteId: TASK_B,
      content: "No visible issue",
      createdAt: DATE,
      supersedesConditionNoteId: null,
      valetSessionId: SESSION_B,
    }));
  await page.route(`**/v1/staff/check-in/sessions/${SESSION_B}/condition-completion`,
    (route) => respond(route, { completedAt: DATE, valetSessionId: SESSION_B }));
  await page.route(`**/v1/staff/check-in/sessions/${SESSION_B}/complete`,
    (route) => respond(route, {
      checkingInCompletedAt: DATE,
      state: "AWAITING_PARKING",
      valetSessionId: SESSION_B,
      version: 2,
    }));
  await page.route(`**/v1/staff/valet-sessions/${SESSION_B}/parking-task/queue`,
    (route) => respond(route, taskB("QUEUED", 1, null)));
  await page.route(`**/v1/staff/tasks/${TASK_B}/assign`,
    (route) => respond(route, taskB("ASSIGNED", 2, MEMBERSHIP)));
  await page.route(`**/v1/staff/tasks/${TASK_B}/accept`,
    (route) => respond(route, taskB("ACCEPTED", 3, MEMBERSHIP)));
  await page.route(`**/v1/staff/valet-sessions/${SESSION_B}/start-parking`,
    async (route) => {
      watch(route);
      await new Promise<void>((resolve) => { harness.releaseStart = resolve; });
      await respond(route, startB);
    });
  await page.route(`**/v1/staff/valet-sessions/${SESSION_B}`,
    (route) => respond(route, {
      checkIn: { conditionCompletedAt: DATE },
      handoff: { pendingAt: null, verification: null },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      keySlot: null,
      locationId: LOCATION,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId: SESSION_B,
      state: "AWAITING_PARKING",
      vehicle: car("B-PLATE-390"),
      version: 2,
    }));
  await page.route(`**/v1/staff/valet-sessions/${SESSION_A}`,
    async (route) => {
      watch(route);
      await new Promise<void>((resolve) => { harness.releaseHydrate = resolve; });
      if (harness.hydrateMode === "failure") {
        await respond(route, { code: "UNAVAILABLE", message: "Late A failure" }, 503);
      } else {
        await respond(route, {
          checkIn: { conditionCompletedAt: DATE },
          handoff: { pendingAt: null, verification: null },
          guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
          keySlot: null,
          locationId: LOCATION,
          parking: {
            parkedAt: null,
            parkingSpotCode: null,
            parkingStartedAt: DATE,
            parkingZoneCode: "North",
          },
          sessionId: SESSION_A,
          state: "PARKING",
          vehicle: car("A-PLATE-390"),
          version: 6,
        });
      }
    });
  await page.route("**/v1/staff/valet-sessions/*/confirm-parked",
    (route) => {
      const parts = route.request().url().split("/");
      const sessionId = parts.at(-2) ?? "missing";
      const body = route.request().postDataJSON() as Record<string, unknown>;
      harness.confirmations.push({ sessionId, body });
      return respond(route, {
        parkedAt: DATE,
        parkingSpotCode: "SPOT-390",
        parkingSpotId: TASK_A,
        parkingZoneId: ORG,
        sessionId,
        sessionVersion: 7,
        state: "PARKED",
        taskId: sessionId === SESSION_A ? TASK_A : TASK_B,
        taskStatus: "COMPLETED",
        taskVersion: 10,
      });
    });
  await page.goto(fixtureUrl);
  await page.locator('input[type="email"]').fill("worker390@example.com");
  await page.locator('input[type="password"]').fill("Password123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Original Hotel").first()).toBeVisible();
  return harness;
}
