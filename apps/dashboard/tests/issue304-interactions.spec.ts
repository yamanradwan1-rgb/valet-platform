import { expect, test } from "@playwright/test";
import { LOCATION_A } from "../e2e/support/dashboard-api-fixture";
import { enterInspector, inspector, selectFamily, selectLocation } from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";

test("Issue304 pagination fetches the next API page and resets on A→B→A", async ({ page }) => {
  const seen: string[] = [];
  const fixture = issue304Fixture({ paged: true, onRequest: (path, request) => {
    if (/\/physical-resources\/overview$/u.test(path))
      seen.push(`${path}?${new URL(request.url()).searchParams.toString()}`);
    return undefined;
  } });
  await fixture.install(page);
  await enterInspector(page);
  await selectFamily(page, "keys");
  await expect(inspector(page).locator('[data-issue304-resource-list] [data-resource-code="K-02"]')).toBeVisible();
  await expect(inspector(page).locator('[data-issue304-resource-list] [data-resource-code="K-08"]')).toHaveCount(0);
  await inspector(page).locator("[data-issue304-resource-list] button").last().focus();
  await inspector(page).locator(".c-master-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(inspector(page).locator('[data-issue304-resource-list] [data-resource-code="K-08"]')).toBeVisible();
  expect(seen.some((url) => url.includes("keyCursor=issue304-next"))).toBe(true);
  await selectLocation(page, "B");
  await expect(inspector(page).locator('[data-issue304-resource-list] [data-resource-code="K-12"]')).toBeVisible();
  await selectLocation(page, "A");
  await expect(inspector(page).locator('[data-issue304-resource-list] [data-resource-code="K-02"]')).toBeVisible();
  await expect(inspector(page).locator('[data-issue304-resource-list] [data-resource-code="K-08"]')).toHaveCount(0);
  expect(seen.some((url) => url.includes(LOCATION_A.locationId))).toBe(true);
});

test("Issue304 vehicle and custody are truthful, QR dialog is keyboard accessible", async ({ page }) => {
  const fixture = issue304Fixture();
  await fixture.install(page);
  await enterInspector(page);
  await selectFamily(page, "keys");
  const row = inspector(page).locator('[data-resource-code="K-02"]');
  await expect(row).toContainText("DEMO 4821");
  await row.click();
  await expect(inspector(page).locator(".c-vehicle strong")).toContainText("DEMO 4821");
  await expect(inspector(page)).toContainText(/Key custody|عهدة المفتاح/u);
  const qr = inspector(page).locator(".c-detail .c-qr-action");
  await qr.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/K-02/u);
  await expect(dialog).toContainText(/vaylet|VAYLET/u);
  const focus = await page.evaluate(() => Boolean(
    document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
  expect(focus).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(qr).toBeFocused();
});

test("Issue304 create preview is explicit and cannot mutate without submission", async ({ page }) => {
  const writes: string[] = [];
  const fixture = issue304Fixture({ onRequest: (path, request) => {
    if (request.method() !== "GET" && /\/physical-resources\//u.test(path)) writes.push(path);
    return undefined;
  } });
  await fixture.install(page);
  await enterInspector(page);
  const create = inspector(page).getByRole("button", { name: /Add Key Slot|إضافة خانة/u });
  await create.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/Resource code|رمز المورد/u);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(writes, "opening/cancelling preview must not POST").toEqual([]);
});

test("Issue304 contains no Search or unsupported live API surface", async ({ page }) => {
  const fixture = issue304Fixture();
  await fixture.install(page);
  await enterInspector(page);
  await expect(inspector(page).getByRole("searchbox")).toHaveCount(0);
  await expect(inspector(page).getByRole("button", { name: /^Search$|^بحث$/u })).toHaveCount(0);
  expect([...fixture.counts.keys()].filter((path) => /\/sessions\/search|\/search$/u.test(path))).toEqual([]);
});
