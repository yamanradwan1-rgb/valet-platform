import { expect, test } from "@playwright/test";
import {
  PresenceFixture, fillZone, lmBase,
} from "./support/presence-fixtures";

const field = (name: string) =>
  `[data-presence-field="${name}"]`;
const failed = (code: string, status = 409) => ({
  status,
  body: { code, message: "fixture", requestId: "issue280-controlled" },
});

test("MFA step-up refreshes zone draft without silently replaying saved intent", async ({
  page,
}) => {
  const fixture = new PresenceFixture("LM", (path, request, state) =>
    path.endsWith("/zones") &&
    request.method() === "POST" &&
    !state.fixture.mfaAssured
      ? failed("MFA_STEP_UP_REQUIRED", 403)
      : undefined,
  );
  await fixture.open(page);
  fixture.fixture.mfaAssured = false;
  fixture.fixture.mfaState = "STEP_UP_REQUIRED";
  await page.getByTestId("presence-view-zones").click();
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const zoneDialog = await fillZone(page);
  await zoneDialog.getByRole("button", { name: "Save", exact: true }).click();
  const mfa = page.getByRole("dialog").last();
  await expect(mfa).toContainText("Authenticator");
  await mfa.getByLabel("Authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(zoneDialog.getByLabel("Label", { exact: true }))
    .toHaveValue("South entrance");
  await expect(zoneDialog).toContainText(
    "Verification completed. Review refreshed state and submit explicitly.",
  );
  expect(fixture.writes).toHaveLength(1);
  await zoneDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(zoneDialog).toHaveCount(0);
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.writes[1]!.body.zoneId).toBe(fixture.writes[0]!.body.zoneId);
  expect(fixture.writes[1]!.body.mutationId).not.toBe(
    fixture.writes[0]!.body.mutationId,
  );
});

test("partial policy result has one authoritative save and one held UNKNOWN write", async ({
  page,
}) => {
  let unknownMutation = "";
  const fixture = new PresenceFixture("LM", (path, request) => {
    if (
      path === `${lmBase}/policy/override` &&
      request.method() === "PUT" &&
      request.postDataJSON().field === "shiftEndPresenceMode"
    ) {
      unknownMutation = request.postDataJSON().mutationId;
      return failed("SERVER_ERROR", 503);
    }
    if (path.includes("/results/")) {
      expect(path).toBe(`${lmBase}/results/${unknownMutation}`);
      return {
        body: {
          mutationId: unknownMutation,
          attribution: "UNKNOWN",
          effect: null,
          entityId: null,
          revision: null,
          canonical: { kind: "POLICY", value: fixture.policy },
        },
      };
    }
    return undefined;
  });
  await fixture.open(page);
  await page.getByTestId("presence-view-policy").click();
  await page.getByTestId("shift-presence-policy")
    .locator("details > summary").click();
  const accuracy = page.locator(field("shiftPresenceMaxAccuracyMeters"));
  await accuracy.getByRole("textbox").fill("60");
  await accuracy.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect(accuracy).toContainText("60");
  expect(fixture.policy.effective.maxAccuracyMeters).toBe(60);

  const end = page.locator(field("shiftEndPresenceMode"));
  await end.getByRole("combobox").selectOption("WARN_ONLY");
  await end.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  await expect(page.getByTestId("shift-presence")).toContainText(
    "outcome of your request is unknown",
  );
  expect(fixture.policy.effective.endMode).toBe("OFF");
  expect(fixture.policy.effective.maxAccuracyMeters).toBe(60);
  expect(fixture.writes[0]!.body.mutationId).not.toBe(unknownMutation);
  await page.getByTestId("presence-view-setup").click();
  await page.getByTestId("presence-view-policy").click();
  expect(fixture.writes).toHaveLength(2);
  await page.getByRole("button", { name: "Retry reconciliation" }).click();
  expect(fixture.writes).toHaveLength(2);
});

test("exception review updates PENDING/HISTORY, never Shift state", async ({
  page,
}) => {
  const fixture = new PresenceFixture("LM");
  await fixture.open(page);
  await page.getByTestId("presence-view-exceptions").click();
  const section = page.getByTestId("presence-exceptions");
  await expect(section).toContainText("Nadia Salem");
  await section.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Review Presence Exception",
  });
  await expect(dialog).toContainText(
    "Approval does not start or end the Shift",
  );
  await dialog.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await section.getByRole("button", { name: "History", exact: true }).click();
  await expect(section).toContainText("Approved");
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]!.path).toContain("/exceptions/");
  expect(fixture.requests.some((url) => url.includes("/shifts/"))).toBe(false);
});
