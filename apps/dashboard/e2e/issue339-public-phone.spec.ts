import { expect, test } from "@playwright/test";
import {
  enterGuestContact,
  guestContactFixture,
} from "./support/guest-contact-fixture";

test("#339 Company + Location save, reload, inheritance and unavailable", async ({
  page,
}, info) => {
  const { fixture, state } = guestContactFixture();
  await enterGuestContact(page, fixture);
  await page
    .locator("summary")
    .filter({ hasText: "Company contact defaults" })
    .click();
  await page
    .getByRole("button", { name: "Edit defaults", exact: true })
    .click();
  const companyPhone = page.locator("#guest-information-company-phone");
  await companyPhone.fill("0790000000");
  await page
    .getByRole("button", { name: "Save company defaults", exact: true })
    .click();
  await expect.poll(() => state.company.phone).toBe("+962790000000");
  await expect(companyPhone).toHaveValue("+962790000000");
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .getByRole("button", { name: "Set a location value", exact: true })
    .click();
  const phone = page.locator("#guest-information-override-phone");
  await phone.fill("0780000000");
  await page
    .getByRole("button", { name: "Save location", exact: true })
    .click();
  await expect
    .poll(() => state.location.phone)
    .toEqual({ mode: "OVERRIDE", value: "+962780000000" });
  await page.screenshot({
    path: info.outputPath("contact-saved.png"),
    fullPage: true,
  });
  await page.reload();
  await page.locator('[data-view-target="contact"]').click();
  await expect(
    page.getByText("+962780000000", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .getByRole("button", { name: "Use company number", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save location", exact: true })
    .click();
  await expect.poll(() => state.location.phone.mode).toBe("INHERIT");
  await page
    .getByRole("button", { name: "Set a location value", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mark unavailable", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save location", exact: true })
    .click();
  await expect
    .poll(() => state.location.phone)
    .toEqual({ mode: "UNAVAILABLE", value: null });
});

test("#339 precise field errors stay separate from denied, stale and server saves", async ({
  page,
}) => {
  const { fixture, state } = guestContactFixture();
  await enterGuestContact(page, fixture);
  await page
    .locator("summary")
    .filter({ hasText: "Company contact defaults" })
    .click();
  await page
    .getByRole("button", { name: "Edit defaults", exact: true })
    .click();
  const phone = page.locator("#guest-information-company-phone");
  const save = page.getByRole("button", {
    name: "Save company defaults",
    exact: true,
  });
  await phone.fill("0790");
  await save.click();
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").first()).toContainText(
    "Jordan mobile number",
  );
  expect(state.puts).toBe(0);
  await phone.fill("0790000000");
  for (const [status, message] of [
    [403, "permission"],
    [500, "Saving failed"],
  ] as const) {
    state.nextStatus = status;
    await save.click();
    await expect(page.locator("#guest-information-announcement")).toContainText(
      message,
    );
    await expect(phone).not.toHaveAttribute("aria-invalid", "true");
    expect(state.company.phone).toBeNull();
  }
  state.nextStatus = 409;
  page.once("dialog", (dialog) => dialog.accept());
  await save.click();
  await expect(page.locator("#guest-information-announcement")).toContainText(
    "Review your edits",
  );
  expect(state.company.phone).toBeNull();
});

test("#339 invalid override can be cleared by inheriting or marking unavailable", async ({ page }) => {
  const { fixture, state } = guestContactFixture();
  state.company.phone = "+962790000000";
  await enterGuestContact(page, fixture);
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  for (const unavailable of [false, true]) {
    await page.getByRole("button", { name: "Set a location value", exact: true }).click();
    await page.locator("#guest-information-override-phone").fill("0790");
    await page.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(page.locator("#guest-information-override-phone")).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: unavailable ? "Mark unavailable" : "Use company number", exact: true }).click();
    await page.getByRole("button", { name: "Save location", exact: true }).click();
    await expect.poll(() => state.location.phone.mode).toBe(unavailable ? "UNAVAILABLE" : "INHERIT");
    await expect(page.locator('[data-widget="overrides"]').getByRole("alert")).toHaveCount(0);
  }
});
