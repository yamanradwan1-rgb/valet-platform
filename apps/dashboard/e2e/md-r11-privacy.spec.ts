import { expect, test } from "@playwright/test";
import { enterR11, r11Fixture } from "./support/md-r11-fixtures";
import { persistentMatches } from "./support/persistent-storage";

test("R11 settings, directory, branding draft and commercial data remain memory-only", async ({
  page,
}, info) => {
  const { fixture } = r11Fixture();
  await fixture.install(page);
  await enterR11(page);
  await page.locator('.ps-section-links a[href*="section=payments"]').click();
  await expect(
    page.locator('[data-setting="valetServiceFee"] .ps-setting-value strong'),
  ).toHaveText("5.500 JOD");
  await page.locator('nav a[href="/employees"]').click();
  await expect(page.getByText("worker@example.com")).toBeVisible();
  await page.locator('nav a[href="/branding"]').click();
  await page.getByLabel("Display name").fill("R11_UNSAVED_PRIVATE_DRAFT");
  await page.goto("/integrations");
  await expect(page).toHaveURL(/\/policies$/u);
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await page.locator('nav a[href="/billing-subscription"]').click();
  await expect(page.locator("h2 bdi")).toBeVisible();
  const plan = await page.locator("h2 bdi").innerText();
  for (const sentinel of [
    "5.500",
    "worker@example.com",
    "R11_UNSAVED_PRIVATE_DRAFT",
    plan,
  ])
    expect(await persistentMatches(page, sentinel)).toEqual({
      local: [],
      session: [],
      indexed: [],
      cache: [],
    });
  const counts = [...fixture.counts];
  await info.attach("request-counts", {
    body: JSON.stringify(counts, null, 2),
    contentType: "application/json",
  });
  await page.waitForTimeout(300);
  expect([...fixture.counts]).toEqual(counts);
});
