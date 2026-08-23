import { expect, test } from "@playwright/test";

import {
  disposeApiContext,
  findSessionIdByPlate,
  guestIssuePickupCode,
  guestRequestRetrieval,
  issueGuestAccess,
  staffLogin,
} from "./support/api";
import {
  assertNoPrototypeLeaks,
  completeParkingViaUi,
  createParkingTaskViaUi,
  signInViaUi,
} from "./support/ui";

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "e2e-driver@valet.test";
const STAFF_PASSWORD =
  process.env.E2E_STAFF_PASSWORD ?? "e2e-secure-password-123";
const LOCATION_ID =
  process.env.E2E_LOCATION_ID ?? "e2e00000-0000-4000-8000-000000000001";

test.describe("Employee full lifecycle", () => {
  test.afterAll(async () => disposeApiContext());

  test("uses real UI and APIs through COMPLETED", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const plate = `E2E-L-${String(Date.now()).slice(-7)}`;
    await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
    await createParkingTaskViaUi(page, {
      keySlot: `E2E-KEY-L${testInfo.retry}`,
      phone: "+962790000001",
      plate,
    });

    const staffToken = await staffLogin(STAFF_EMAIL, STAFF_PASSWORD);
    const sessionId = await findSessionIdByPlate(
      staffToken,
      LOCATION_ID,
      plate,
    );
    const guestToken = await issueGuestAccess(staffToken, sessionId);

    await completeParkingViaUi(page, `E2E-SPOT-L${testInfo.retry}`);
    await page.getByRole("button", { name: "Done" }).click();
    await guestRequestRetrieval(guestToken);

    await page.getByRole("button", { name: "Accept Task" }).click();
    const keyInput = page.locator('input[placeholder="Enter Key Slot Code"]');
    await keyInput.fill(`E2E-KEY-L${testInfo.retry}`);
    await page.getByRole("button", { name: "Verify Key Slot" }).click();
    await page.getByRole("button", { name: "Start Retrieval" }).click();
    await page.getByRole("button", { name: "Vehicle Ready" }).click();
    await page.getByRole("button", { name: "Begin Guest Handoff" }).click();

    const pickupCode = await guestIssuePickupCode(guestToken);
    await page.locator('input[inputmode="numeric"]').fill(pickupCode);
    await page.getByRole("button", { name: "Verify Code" }).click();
    await page.getByRole("button", { name: "Release Vehicle" }).click();

    await expect(page.getByText("Handoff Complete")).toBeVisible({
      timeout: 15_000,
    });
    await assertNoPrototypeLeaks(page);
  });
});
