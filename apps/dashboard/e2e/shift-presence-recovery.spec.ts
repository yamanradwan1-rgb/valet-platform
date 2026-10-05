import { expect, test } from "@playwright/test";
import {
  PresenceFixture,
  attendanceZone,
  fillZone,
  lmBase,
  ZONE_ID,
} from "./support/presence-fixtures";

const error = (code: string, status = 409) => ({
  status,
  body: { code, message: "controlled", requestId: "fixture" },
});

test("UNKNOWN survives dialog close and exact GET retry failures without duplicate create", async ({
  page,
}) => {
  let mutationId = "";
  let zoneId = "";
  let proof: "UNKNOWN" | "FAIL" | "COMMITTED" = "UNKNOWN";
  const f = new PresenceFixture("LM", (path, request, state) => {
    if (path === `${lmBase}/zones` && request.method() === "POST") {
      const body = request.postDataJSON();
      mutationId = body.mutationId;
      zoneId = body.zoneId;
      const {
        mutationId: ignoredMutation,
        zoneId: ignoredZone,
        ...config
      } = body;
      void ignoredMutation;
      void ignoredZone;
      state.zones = [{ ...attendanceZone(), ...config, id: zoneId }];
      return error("SERVER_ERROR", 503);
    }
    if (path.includes("/results/")) {
      expect(path).toBe(`${lmBase}/results/${mutationId}`);
      expect(new URL(request.url()).searchParams.get("entityId")).toBe(zoneId);
      if (proof === "FAIL") return error("SERVER_ERROR", 503);
      return {
        body: {
          mutationId,
          attribution: proof,
          effect: proof === "COMMITTED" ? "CHANGED" : null,
          entityId: proof === "COMMITTED" ? zoneId : null,
          revision: proof === "COMMITTED" ? 1 : null,
          canonical: {
            kind: "ZONE",
            value: { zone: state.zones[0], readiness: state.policy.readiness },
          },
        },
      };
    }
    return undefined;
  });
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toContainText("outcome of your request is unknown");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeDisabled();
  proof = "FAIL";
  await page
    .getByRole("button", { name: "Retry reconciliation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry reconciliation", exact: true }),
  ).toBeEnabled();
  proof = "COMMITTED";
  await page
    .getByRole("button", { name: "Retry reconciliation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  expect(f.writes).toHaveLength(1);
  expect(f.requests.filter((url) => url.includes("/results/")).length).toBe(3);
});

test("policy CAS preserves old/current/draft and resubmits only after explicit reapply", async ({
  page,
}) => {
  let conflict = true;
  const f = new PresenceFixture("LM", (path, request, state) => {
    if (
      path.endsWith("/policy/override") &&
      request.method() === "PUT" &&
      conflict
    ) {
      conflict = false;
      state.policy.overrides.revision = 2;
      state.policy.overrides.maxAccuracyMetersOverride = 60;
      state.policy.effective.maxAccuracyMeters = 60;
      state.policy.readiness = {
        ...state.policy.readiness,
        locationRevision: 2,
        configurationFingerprint: "c".repeat(64),
      };
      return error("PRESENCE_REVISION_CONFLICT");
    }
    return undefined;
  });
  await f.open(page);
  const row = page.locator(
    '[data-presence-field="shiftPresenceMaxAccuracyMeters"]',
  );
  await row.getByRole("textbox").fill("70");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row).toContainText("Previous saved value: 50");
  await expect(row).toContainText("Current server value: 60");
  await expect(row.getByRole("textbox")).toHaveValue("70");
  await expect(
    row.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(f.writes).toHaveLength(1);
  await row
    .getByRole("button", { name: "Review current state and reapply draft" })
    .click();
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByRole("textbox")).toHaveValue("70");
  expect(f.writes).toHaveLength(2);
  expect(f.writes[1]!.body).toMatchObject({
    expectedRevision: 2,
    value: 70,
    configurationFingerprint: "c".repeat(64),
  });
  expect(f.writes[1]!.body.mutationId).not.toBe(f.writes[0]!.body.mutationId);
});

test("zone MFA restores draft, rereads context and requires explicit new submission", async ({
  page,
}) => {
  const f = new PresenceFixture("LM", (path, request, state) => {
    if (
      path.endsWith("/zones") &&
      request.method() === "POST" &&
      !state.fixture.mfaAssured
    )
      return error("MFA_STEP_UP_REQUIRED", 403);
    return undefined;
  });
  await f.open(page);
  f.fixture.mfaAssured = false;
  f.fixture.mfaState = "STEP_UP_REQUIRED";
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const mfa = page.getByRole("dialog").last();
  await mfa.getByLabel("Authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByLabel("Label", { exact: true })).toHaveValue(
    "South entrance",
  );
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  expect(f.writes).toHaveLength(1);
  await expect(dialog).toContainText(
    "Verification completed. Review refreshed state and submit explicitly.",
  );
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(f.writes).toHaveLength(2);
  expect(f.writes[1]!.body.zoneId).toBe(f.writes[0]!.body.zoneId);
  expect(f.writes[1]!.body.mutationId).not.toBe(f.writes[0]!.body.mutationId);
});

test("self/cannot-review and locally expired Pending requests cannot be approved", async ({
  page,
}) => {
  const f = new PresenceFixture();
  f.exceptions[0]!.canReview = false;
  await f.open(page);
  await page
    .getByTestId("presence-exceptions")
    .getByRole("button", { name: "Details", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  f.exceptions[0]!.canReview = true;
  f.exceptions[0]!.expiresAt = new Date(Date.now() - 1000).toISOString();
  await page
    .getByTestId("presence-exceptions")
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await page
    .getByTestId("presence-exceptions")
    .getByRole("button", { name: "Details", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Approve", exact: true }),
  ).toBeDisabled();
  expect(f.writes).toHaveLength(0);
});

test("zone enable/disable always loads exact target and uses its positive revision", async ({
  page,
}) => {
  const f = new PresenceFixture();
  await f.open(page);
  await page
    .getByTestId("presence-zones")
    .getByRole("button", { name: "Disable", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Disabling this zone may change readiness",
  );
  await dialog.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(f.writes[0]!.path).toBe(`${lmBase}/zones/${ZONE_ID}`);
  expect(f.writes[0]!.body).toMatchObject({
    expectedRevision: 1,
    state: "DISABLED",
    radiusMeters: 25.5,
  });
  expect(f.requests.some((url) => url.endsWith(`/zones/${ZONE_ID}`))).toBe(
    true,
  );
});
