import { expect, test } from "@playwright/test";
import {
  forceFixture,
  enterForceHistory,
  openForceEnd,
  fillForceEnd,
  errorReply,
} from "./support/issue240g-force-end";

test("Shift+Tab trap, topmost Escape and nested MFA focus return preserve explicit intent", async ({
  page,
}) => {
  const setup = forceFixture({
    onPost: () => errorReply("MFA_STEP_UP_REQUIRED", 403),
  });
  await setup.install(page);
  await enterForceHistory(page);
  const dialog = await openForceEnd(page);
  const reason = dialog.getByLabel("Reason", { exact: true });
  await expect(reason).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(reason).toBeFocused();
  await fillForceEnd(page);
  await dialog
    .getByRole("button", { name: "Force End Shift", exact: true })
    .click();
  const mfa = page.getByRole("dialog", {
    name: "Verification required",
    exact: true,
  });
  await expect(mfa.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(mfa).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  expect(setup.posts).toHaveLength(1);
  await expect(reason).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .getByRole("dialog", { name: "Shift details", exact: true })
      .getByRole("button", { name: "Force End Shift", exact: true }),
  ).toBeFocused();
  expect(setup.posts).toHaveLength(1);
});
