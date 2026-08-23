import { expect, test } from "@playwright/test";

import {
  assertNoPrototypeLeaks,
  createParkingTaskViaUi,
  signInViaUi,
} from "./support/ui";

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "e2e-driver@valet.test";
const STAFF_PASSWORD =
  process.env.E2E_STAFF_PASSWORD ?? "e2e-secure-password-123";

test("reports an order-independent incident from a real operation", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const plate = `E2E-I-${String(Date.now()).slice(-7)}`;
  await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
  await createParkingTaskViaUi(page, {
    keySlot: `E2E-KEY-I${testInfo.retry}`,
    phone: "+962790000002",
    plate,
  });
  await page.getByRole("button", { name: "Start Parking" }).click();
  await page.getByRole("button", { name: "Report Issue" }).click();

  await page.getByRole("button", { name: "Vehicle damage" }).click();
  await page.getByRole("button", { name: "Medium" }).click();
  await page
    .locator("textarea")
    .fill("Independent Employee E2E incident from active parking.");
  await page.getByRole("button", { name: "Open Incident" }).click();

  await expect(page.getByText("Incident opened")).toBeVisible({
    timeout: 15_000,
  });
  const body = await page.textContent("body");
  expect(body).toMatch(
    /Reference:\s*[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  expect(body).not.toContain("INC-1042");
  expect(body).not.toContain("Supervisor notified");
  expect(body).not.toContain("Add Photo");

  await page.getByRole("button", { name: "Return" }).click();
  await expect(page.getByRole("button", { name: "Park Vehicle" })).toBeVisible();
  await assertNoPrototypeLeaks(page);
});
