import { expect, test, type Page } from "@playwright/test";

import {
  contextHelpRegistry,
  type ContextHelpKey,
} from "../src/features/help/context-help-registry";
import { PresenceFixture, lmBase } from "./support/presence-fixtures";

function help(page: Page, key: ContextHelpKey, locale: "en" | "ar" = "en") {
  const prefix = locale === "ar" ? "مساعدة: " : "Help: ";
  return page.getByRole("button", {
    name: prefix + contextHelpRegistry[key][locale].title,
    exact: true,
  });
}

const policyFields = [
  ["shiftStartPresenceMode", "presence.shiftStartPresenceMode"],
  ["shiftEndPresenceMode", "presence.shiftEndPresenceMode"],
  ["shiftPresenceMaxAccuracyMeters", "presence.shiftPresenceMaxAccuracyMeters"],
  ["shiftPresenceMaxFixAgeSeconds", "presence.shiftPresenceMaxFixAgeSeconds"],
] as const satisfies readonly (readonly [string, ContextHelpKey])[];

test("Shift Presence mounts scoped bilingual help and every policy row keeps Help Save-adjacent", async ({
  page,
}) => {
  const f = new PresenceFixture("LM");
  await f.open(page);

  for (const key of [
    "policies.presence",
    "presence.readiness",
    "presence.zones",
    "presence.exceptions",
  ] as const satisfies readonly ContextHelpKey[]) {
    await expect(help(page, key)).toHaveCount(1);
  }

  for (const [field, key] of policyFields) {
    const row = page.locator(`[data-presence-field="${field}"]`);
    const actionButtons = row.locator("td").last().getByRole("button");
    await expect(actionButtons).toHaveCount(3);
    await expect(actionButtons.nth(0)).toHaveText("Save");
    await expect(actionButtons.nth(1)).toHaveAttribute(
      "aria-label",
      "Help: " + contextHelpRegistry[key].en.title,
    );
    await expect(actionButtons.nth(2)).toHaveText("Clear Override");
  }

  await page.getByRole("button", { name: "Language" }).click();
  await expect(help(page, "policies.presence", "ar")).toBeVisible();
});

test("policy conflict keeps stale draft while nested field help opens and closes", async ({
  page,
}) => {
  let conflict = true;
  const f = new PresenceFixture("LM", (path, request, state) => {
    if (
      conflict &&
      path.endsWith("/policy/override") &&
      request.method() === "PUT"
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
      return {
        status: 409,
        body: {
          code: "PRESENCE_REVISION_CONFLICT",
          message: "controlled",
          requestId: "fixture",
        },
      };
    }
    return undefined;
  });
  await f.open(page);
  const row = page.locator(
    '[data-presence-field="shiftPresenceMaxAccuracyMeters"]',
  );
  const input = row.getByRole("textbox");
  await input.fill("70");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row).toContainText("Current server value: 60");
  await expect(input).toHaveValue("70");
  expect(f.writes).toHaveLength(1);

  const trigger = help(page, "presence.shiftPresenceMaxAccuracyMeters");
  await trigger.click();
  const child = page.getByRole("dialog", {
    name: contextHelpRegistry["presence.shiftPresenceMaxAccuracyMeters"].en
      .title,
  });
  await expect(child).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(input).toHaveValue("70");
  await expect(
    row.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]!.path).toBe(`${lmBase}/policy/override`);
});

test("zone form help preserves historical first-field focus and unsaved draft", async ({
  page,
}) => {
  const f = new PresenceFixture("LM");
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();

  const parent = page.getByRole("dialog", { name: "Add Attendance Zone" });
  const label = parent.getByLabel("Label", { exact: true });
  await expect(label).toBeFocused();
  await label.fill("UNSAVED PRESENCE ZONE");
  const trigger = help(page, "presence.zoneForm");
  await trigger.click();

  const child = page.getByRole("dialog", {
    name: contextHelpRegistry["presence.zoneForm"].en.title,
  });
  await expect(child).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(label).toHaveValue("UNSAVED PRESENCE ZONE");
  await expect(trigger).toBeFocused();
  expect(f.writes).toEqual([]);
});

test("review help stays nested, preserves parent dialog, and performs no review write", async ({
  page,
}) => {
  const f = new PresenceFixture("LM");
  await f.open(page);
  await page
    .getByTestId("presence-exceptions")
    .getByRole("button", { name: "Review", exact: true })
    .click();

  const parent = page.getByRole("dialog", {
    name: "Review Presence Exception",
    exact: true,
  });
  const close = parent.getByRole("button", { name: "Close", exact: true });
  await expect(parent).toContainText(
    "Approval does not start or end the Shift",
  );
  await expect(close).toBeFocused();
  const trigger = help(page, "presence.review");
  await trigger.click();

  const child = page.getByRole("dialog", {
    name: contextHelpRegistry["presence.review"].en.title,
    exact: true,
  });
  await expect(child).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(
    parent.getByRole("button", { name: "Approve", exact: true }),
  ).toBeEnabled();
  expect(f.writes).toEqual([]);
});
