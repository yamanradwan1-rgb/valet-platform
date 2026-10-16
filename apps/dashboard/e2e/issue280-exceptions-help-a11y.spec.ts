import { expect, test } from "@playwright/test";
import { contextHelpRegistry } from "../src/features/help/context-help-registry";
import {
  PresenceFixture,
  presenceException,
} from "./support/presence-fixtures";

test("pending/history distinguish authorized review and read-only facts without writes", async ({
  page,
}) => {
  const historicalId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const f = new PresenceFixture("LM", (path) =>
    path.endsWith(`/exceptions/${historicalId}`)
      ? { body: f.exceptions[1] }
      : undefined,
  );
  f.exceptions = [
    presenceException(),
    {
      ...presenceException(),
      exceptionId: historicalId,
      status: "APPROVED",
      revision: 2,
      reviewedAt: new Date().toISOString(),
      canReview: false,
    },
  ];
  await f.open(page);
  const list = page.getByTestId("presence-exceptions");
  await expect(list).toContainText("Pending requests awaiting");
  await expect(
    list.getByRole("region", { name: /Presence Exceptions — Pending/u }),
  ).toBeVisible();
  const review = list.getByRole("button", { name: "Review", exact: true });
  await expect(review).toHaveAttribute(
    "aria-describedby",
    /presence-requester-/u,
  );
  await review.click();
  const dialog = page.getByRole("dialog", {
    name: "Review Presence Exception",
  });
  await expect(dialog).toContainText("Outside attendance zone");
  await expect(dialog).toContainText(
    "Only a current Company Admin or exact Location Manager",
  );
  await expect(dialog).toContainText(
    "Approval does not start or end the Shift",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();
  await list.getByRole("button", { name: "History", exact: true }).click();
  await expect(list).toContainText("Read-only past decisions");
  await expect(list).toContainText("Approved");
  await expect(
    list.getByRole("button", { name: "Review", exact: true }),
  ).toHaveCount(0);
  await list.getByRole("button", { name: "Details", exact: true }).click();
  await expect(dialog).toContainText("read-only in its current state");
  await expect(
    dialog.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Reject", exact: true }),
  ).toHaveCount(0);
  expect(f.writes).toEqual([]);
});

test("review Help nests, escapes to trigger, and preserves pending decision without a Shift call", async ({
  page,
}) => {
  const f = new PresenceFixture("CA");
  await f.open(page);
  await page
    .getByTestId("presence-exceptions")
    .getByRole("button", { name: "Review", exact: true })
    .click();
  const parent = page.getByRole("dialog", {
    name: "Review Presence Exception",
  });
  const help = page.getByRole("button", {
    name: "Help: " + contextHelpRegistry["presence.review"].en.title,
  });
  await expect(
    parent.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await help.click();
  const child = page.getByRole("dialog", {
    name: contextHelpRegistry["presence.review"].en.title,
    exact: true,
  });
  await expect(child).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(help).toBeFocused();
  await expect(parent.getByRole("button", { name: "Approve" })).toBeEnabled();
  expect(f.writes).toEqual([]);
  await parent.getByRole("button", { name: "Approve", exact: true }).click();
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]!.body).toMatchObject({
    expectedRevision: 1,
    mutationId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
  });
  expect(f.requests.every((url) => !url.includes("/shifts/"))).toBe(true);
});

test("Arabic dark 390 exception list and dialog retain RTL, safe focus and bounded width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const f = new PresenceFixture("LM");
  await f.open(page);
  await page.evaluate(() => {
    localStorage.setItem("vaylet_dashboard_locale", "ar");
    localStorage.setItem("vaylet_dashboard_theme", "dark");
    window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
    window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
  });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const list = page.getByTestId("presence-exceptions");
  await expect(list).toContainText("طلبات قيد الانتظار");
  await list.getByRole("button", { name: "مراجعة", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "مراجعة استثناء الحضور" });
  await expect(dialog).toContainText("الموافقة لا تبدأ المناوبة");
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-0.5);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390.5);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(f.writes).toEqual([]);
});
