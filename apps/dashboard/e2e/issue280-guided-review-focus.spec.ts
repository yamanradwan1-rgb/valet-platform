import { expect, test } from "@playwright/test";
import { PresenceFixture } from "./support/presence-fixtures";
import { mockIssue280Map } from "./issue280-map-first-map-mock";

test("guided Review, Confirm and Apply retain keyboard focus and correct help", async ({ page }) => {
  const fixture = new PresenceFixture("LM");
  await mockIssue280Map(page);
  await fixture.open(page);
  await page.getByTestId("presence-view-setup").click();
  await page.getByRole("button", { name: "Step 3: Policy" }).click();
  await page.getByTestId("presence-setup-policy").locator("details summary").click();
  await page.getByTestId("presence-inheritance-shiftStartPresenceMode").selectOption("CUSTOM");
  await page.locator('[data-presence-field="shiftStartPresenceMode"]')
    .getByRole("combobox").last().selectOption("REQUIRE");
  expect(fixture.writes).toEqual([]);
  await page.getByRole("button", { name: "Step 4: Review" }).click();
  const review = page.getByTestId("presence-setup-review");
  const help = review.getByRole("button", { name: "Help: Shift presence policies" });
  await help.click();
  await expect(page.getByRole("dialog", { name: "Shift presence policies" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();

  const start = review.getByRole("button", { name: "Review changes" });
  await start.focus();
  await page.keyboard.press("Enter");
  const acknowledgment = review.getByRole("checkbox", { name: /I understand/u });
  await expect(acknowledgment).toBeFocused();
  await page.keyboard.press("Space");
  const confirm = review.getByRole("button", { name: "Confirm changes" });
  await confirm.focus();
  await page.keyboard.press("Enter");
  const apply = review.getByRole("button", { name: "Apply confirmed changes" });
  await expect(apply).toBeFocused();
  expect(fixture.writes).toEqual([]);
  await page.keyboard.press("Enter");
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect(review.locator('p[role="status"]').last()).toBeFocused();
});
