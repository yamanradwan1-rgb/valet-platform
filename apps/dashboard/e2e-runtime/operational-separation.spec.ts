import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  controlFixture,
  runtimeFixture as f,
  signIn,
} from "./support/runtime-fixture";

interface SessionSnapshot {
  readonly keySlotId: string | null;
  readonly state: string;
  readonly version: number;
}

async function snapshot(kind: "custody" | "guest"): Promise<SessionSnapshot> {
  return JSON.parse(await controlFixture("session-snapshot", kind)) as SessionSnapshot;
}

async function staffPost(
  page: Page,
  accessToken: string,
  path: string,
  body: unknown,
): Promise<{ body: Record<string, unknown>; status: number }> {
  return page.evaluate(async ({ accessToken, body, path }) => {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return {
      body: await response.json() as Record<string, unknown>,
      status: response.status,
    };
  }, { accessToken, body, path });
}

async function guestRetrieval(request: APIRequestContext) {
  return request.post("http://localhost:3001/v1/guest/session/request-retrieval", {
    data: {},
    headers: { Authorization: `Bearer ${f.operations.guest.rawToken}` },
  });
}

test("Company Admin Management authority cannot mutate physical key custody", async ({ page }) => {
  const accessToken = await signIn(page, f.emails.conflictAdmin);
  await assurePreEnrolled(page);
  const before = await snapshot("custody");

  const response = await staffPost(
    page,
    accessToken,
    `/v1/staff/valet-sessions/${f.operations.custody.sessionId}/key-slot/assign`,
    { expectedVersion: before.version, keySlotCode: f.operations.custody.keySlotCode },
  );

  expect(response.status).toBe(404);
  expect(response.body.code).toBe("AUTHORIZATION_DENIED");
  expect(await snapshot("custody")).toEqual(before);
});

test("Management entitlement loss does not block Employee or Guest operations", async ({
  page,
  request,
}) => {
  await controlFixture("dashboard-entitlement", "off");
  const employeeToken = await signIn(page, f.emails.employee);
  await expect(
    page.getByText("No eligible Management workspace is available for this Staff session.").first(),
  ).toBeVisible();

  const shift = await staffPost(
    page,
    employeeToken,
    `/v1/staff/shifts/${f.shifts.employee}/end`,
    { cashReported: "0" },
  );
  expect(shift.status).toBe(200);
  expect(shift.body.status).toBe("ENDED");

  const guest = await guestRetrieval(request);
  expect(guest.status()).toBe(200);
  expect(await guest.json()).toMatchObject({
    state: "REQUESTED",
    valetSessionId: f.operations.guest.sessionId,
  });
  expect(await snapshot("guest")).toMatchObject({ state: "REQUESTED", version: 2 });
});
