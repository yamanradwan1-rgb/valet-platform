import { expect, test } from "@playwright/test";
import {
  PresenceFixture,
  fillZone,
  lmBase,
  attendanceZone,
} from "./support/presence-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { ORG_A, LOCATION_A } from "./support/fixture-data";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const error = (status: number, code: string) => ({
  status,
  body: { code, message: "controlled", requestId: "fixture" },
});

test("mutation 401 replaces the session without replaying the zone create", async ({
  page,
}) => {
  const f = new PresenceFixture("LM", (path, request) =>
    path === `${lmBase}/zones` && request.method() === "POST"
      ? error(401, "STAFF_AUTHENTICATION_REQUIRED")
      : undefined,
  );
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  const refreshesBefore = f.fixture.count("/v1/staff/auth/refresh");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => f.fixture.count("/v1/staff/auth/refresh"))
    .toBe(refreshesBefore + 1);
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  expect(f.writes).toHaveLength(1);
});

for (const outcome of ["success", "error", "result"] as const) {
  test(`logout and identity replacement retire delayed ${outcome}`, async ({
    page,
  }) => {
    const started = gate();
    const pending = gate();
    let receipt = "";
    let zoneId = "";
    const f = new PresenceFixture("LM", async (path, request, state) => {
      if (path === `${lmBase}/zones` && request.method() === "POST") {
        const body = request.postDataJSON();
        receipt = body.mutationId;
        zoneId = body.zoneId;
        if (outcome === "result") return error(503, "SERVER_ERROR");
        started.release();
        await pending.promise;
        if (outcome === "error")
          return error(409, "PRESENCE_REVISION_CONFLICT");
        return {
          body: {
            zone: {
              ...attendanceZone(),
              id: zoneId,
              label: "Retired identity",
            },
            readiness: state.policy.readiness,
          },
        };
      }
      if (path.includes("/results/")) {
        started.release();
        await pending.promise;
        return {
          body: {
            mutationId: receipt,
            attribution: "COMMITTED",
            effect: "CHANGED",
            entityId: zoneId,
            revision: 1,
            canonical: {
              kind: "ZONE",
              value: {
                zone: {
                  ...attendanceZone(),
                  id: zoneId,
                  label: "Retired identity",
                },
                readiness: state.policy.readiness,
              },
            },
          },
        };
      }
      return undefined;
    });
    await f.open(page);
    await page.getByRole("button", { name: "Add zone", exact: true }).click();
    const old = await fillZone(page);
    await old.getByRole("button", { name: "Save", exact: true }).click();
    await started.promise;
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .evaluate((node: HTMLButtonElement) => node.click());
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await signInOnCurrentPage(page, "replacement@example.com");
    await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
    await page
      .getByRole("button", { name: LOCATION_A.name, exact: true })
      .click();
    await page.getByRole("button", { name: "Add zone", exact: true }).click();
    const fresh = page.getByRole("dialog");
    await fresh.getByLabel("Label", { exact: true }).fill("Replacement draft");
    pending.release();
    await expect(fresh.getByLabel("Label", { exact: true })).toHaveValue(
      "Replacement draft",
    );
    await expect(page.getByTestId("shift-presence")).not.toContainText(
      "Retired identity",
    );
    expect(f.writes).toHaveLength(1);
  });
}

test("session replacement retires delayed MFA without publishing assurance or replay", async ({
  page,
}) => {
  const started = gate();
  const pending = gate();
  let force401 = false;
  const f = new PresenceFixture("LM", async (path, request) => {
    if (path === `${lmBase}/zones` && request.method() === "POST")
      return error(403, "MFA_STEP_UP_REQUIRED");
    if (path === "/v1/staff/auth/mfa/step-up") {
      started.release();
      await pending.promise;
      return { body: { state: "ASSURED" } };
    }
    if (force401 && path === `${lmBase}/policy`) {
      force401 = false;
      return error(401, "STAFF_AUTHENTICATION_REQUIRED");
    }
    return undefined;
  });
  await f.open(page);
  f.fixture.mfaState = "STEP_UP_REQUIRED";
  f.fixture.mfaAssured = false;
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const zone = await fillZone(page);
  await zone.getByRole("button", { name: "Save", exact: true }).click();
  const mfa = page.getByRole("dialog").last();
  await mfa.getByLabel("Authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await started.promise;
  const refreshesBefore = f.fixture.count("/v1/staff/auth/refresh");
  force401 = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect
    .poll(() => f.fixture.count("/v1/staff/auth/refresh"))
    .toBe(refreshesBefore + 1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  pending.release();
  await expect(page.getByTestId("shift-presence")).not.toContainText(
    "Verification completed",
  );
  expect(f.writes).toHaveLength(1);
});
