import { expect, test, type Page } from "@playwright/test";
import { createScopeFixture } from "./issue358-scope-browser-support";
import {
  mountParkingHarness,
  SESSION_A,
  SESSION_B,
  type ParkingHarness,
} from "./issue390-parking-harness";
import { createParkingTaskViaUi } from "./support/ui";

let fixtureUrl: string;
let closeFixture: () => Promise<void>;

test.beforeAll(async () => {
  const fixture = await createScopeFixture();
  fixtureUrl = fixture.fixtureUrl;
  closeFixture = fixture.close;
});

test.afterAll(async () => closeFixture?.());

async function pendingAThenSelectB(
  page: Page,
  harness: ParkingHarness,
  options: { prepareADraft?: "manual" | "qr" } = {},
): Promise<void> {
  // B's unmounted Check-In callback is the delayed selection. A's Parking
  // controller must remain mounted while B later replaces its props.
  await createParkingTaskViaUi(page, {
    phone: "+962790000390",
    plate: "B-PLATE-390",
  });
  await page.getByRole("button", { name: "Start Parking" }).click();
  await expect(
    page.getByRole("button", { name: "Starting Parking..." }),
  ).toBeVisible();
  await expect.poll(() => Boolean(harness.releaseStart)).toBe(true);
  const pendingBack = page
    .getByRole("heading", { name: "Parking Task" })
    .locator("..")
    .getByRole("button");
  await expect(pendingBack).toBeEnabled();
  await pendingBack.click();
  await expect(
    page.getByRole("button", { name: "Continue Parking" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue Parking" }).click();
  await expect.poll(() => Boolean(harness.releaseHydrate)).toBe(true);
  if (options.prepareADraft) {
    await releaseLateA(page, harness);
    await page.getByRole("button", { name: "Park Vehicle" }).click();
    if (options.prepareADraft === "qr") {
      await simulateDecodedQr(
        page,
        "parking-spot",
        "A-SPOT-390",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
    } else {
      await page
        .getByRole("button", { name: "Enter spot code manually" })
        .click();
      await page
        .locator('input[placeholder="Enter spot code"]')
        .fill("A-SPOT-390");
    }
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    if (options.prepareADraft === "qr") {
      await simulateDecodedQr(
        page,
        "key-slot",
        "A-KEY-390",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      );
    } else {
      await page
        .locator('input[placeholder="Enter Key Slot Code"]')
        .fill("A-KEY-390");
    }
  }
  // B resolves after A has mounted and begun hydration, with no intervening
  // nav away from Parking. React should preserve the ParkingFlow instance.
  harness.releaseStart?.();
  await expect(page.getByText("B-PLATE-390").first()).toBeVisible();
}

async function simulateDecodedQr(
  page: Page,
  kind: "parking-spot" | "key-slot",
  resourceCode: string,
  resourceId: string,
): Promise<void> {
  // Inject a validated V2 decode at the mounted scanner callback; camera/decoder
  // behavior is tested separately. The ParkingFlow state and handlers stay real.
  await page.evaluate(
    ({ kind, resourceCode, resourceId }) => {
      type Fiber = {
        return: Fiber | null;
        type: { name?: string } | null;
        memoizedProps: {
          onDecoded: (code: string) => void;
          onDecodedIdentity: (payload: unknown) => void;
        };
      };
      const button = document.querySelector('[data-testid="qr-scan-start"]');
      if (!button) throw new Error("QR capture control not mounted");
      const key = Object.keys(button).find((value) =>
        value.startsWith("__reactFiber$"),
      );
      if (!key) throw new Error("React scanner callback unavailable");
      let node = (button as unknown as Record<string, Fiber>)[key];
      while (node && node.type?.name !== "ResourceQrScanSection")
        node = node.return;
      if (!node) throw new Error("Resource QR scanner not found");
      node.memoizedProps.onDecoded(resourceCode);
      node.memoizedProps.onDecodedIdentity({
        kind,
        resourceCode,
        resourceId,
        version: "V2",
      });
    },
    { kind, resourceCode, resourceId },
  );
}

async function assertFreshBPhysicalDraft(
  page: Page,
  harness: ParkingHarness,
): Promise<void> {
  await page.getByRole("button", { name: "Park Vehicle" }).click();
  await expect(
    page.getByRole("button", { name: "Enter spot code manually" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enter spot code manually" }).click();
  const spot = page.locator('input[placeholder="Enter spot code"]');
  await expect(spot).toHaveValue("");
  await spot.fill("B-SPOT-390");
  const contextReads = harness.requests.filter((url) =>
    url.includes("/v1/staff/operational-context"),
  ).length;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(
      () =>
        harness.requests.filter((url) =>
          url.includes("/v1/staff/operational-context"),
        ).length,
    )
    .toBeGreaterThan(contextReads);
  await expect(spot).toHaveValue("B-SPOT-390");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const key = page.locator('input[placeholder="Enter Key Slot Code"]');
  await expect(key).toHaveValue("");
  await key.fill("B-KEY-390");
  await page
    .getByRole("heading", { name: "Key Slot" })
    .locator("..")
    .getByRole("button")
    .click();
  await expect(spot).toHaveValue("B-SPOT-390");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(key).toHaveValue("B-KEY-390");
  await page.getByRole("button", { name: "Confirm Parked" }).click();
  expect(harness.confirmations).toHaveLength(1);
  expect(harness.confirmations[0]?.sessionId).toBe(SESSION_B);
  expect(harness.confirmations[0]?.body.parkingSpotCode).toBe("B-SPOT-390");
  expect(harness.confirmations[0]?.body.keySlotCode).toBe("B-KEY-390");
  expect(harness.confirmations[0]?.body.expectedSessionVersion).toBe(3);
  expect(harness.confirmations[0]?.body.expectedTaskVersion).toBe(4);
  expect(harness.confirmations[0]?.body).not.toHaveProperty("parkingSpotId");
  expect(harness.confirmations[0]?.body).not.toHaveProperty("keySlotId");
}

async function confirmVisibleParking(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Park Vehicle" }).click();
  await page.getByRole("button", { name: "Enter spot code manually" }).click();
  await page.locator('input[placeholder="Enter spot code"]').fill("SPOT-390");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .locator('input[placeholder="Enter Key Slot Code"]')
    .fill("KEY-390");
  await page.getByRole("button", { name: "Confirm Parked" }).click();
}

async function releaseLateA(
  page: Page,
  harness: ParkingHarness,
): Promise<void> {
  const response = page.waitForResponse((res) =>
    res.url().endsWith(`/v1/staff/valet-sessions/${SESSION_A}`),
  );
  harness.releaseHydrate?.();
  await response;
  // Allow the resolved fetch and React state commit to settle before asserting.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("#390 late A success cannot overwrite mounted B or its confirm target", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const harness = await mountParkingHarness(page, fixtureUrl);
  await pendingAThenSelectB(page, harness);
  await releaseLateA(page, harness);
  await expect(
    page.getByRole("button", { name: "Park Vehicle" }),
  ).toBeVisible();
  await confirmVisibleParking(page);
  expect(harness.confirmations).toHaveLength(1);
  expect(harness.confirmations[0]?.sessionId).toBe(SESSION_B);
  expect(harness.confirmations[0]?.body.expectedTaskVersion).toBe(4);
  expect(errors).toEqual([]);
});

test("#390 late A error cannot contaminate mounted B", async ({ page }) => {
  test.setTimeout(90_000);
  const harness = await mountParkingHarness(page, fixtureUrl);
  harness.hydrateMode = "failure";
  await pendingAThenSelectB(page, harness);
  await releaseLateA(page, harness);
  await expect(
    page.getByRole("button", { name: "Park Vehicle" }),
  ).toBeVisible();
  await expect(page.getByText("Late A failure")).toHaveCount(0);
  await expect(page.getByText("B-PLATE-390").first()).toBeVisible();
});

test("#390 A physical spot and key draft must not carry into B", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const harness = await mountParkingHarness(page, fixtureUrl);
  await pendingAThenSelectB(page, harness, { prepareADraft: "manual" });
  await assertFreshBPhysicalDraft(page, harness);
});

test("#390 A V2 QR resource identities must not carry into B", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const harness = await mountParkingHarness(page, fixtureUrl);
  await pendingAThenSelectB(page, harness, { prepareADraft: "qr" });
  await assertFreshBPhysicalDraft(page, harness);
});

test("#390 changed authorization scope unmounts stale Parking work", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const harness = await mountParkingHarness(page, fixtureUrl);
  await pendingAThenSelectB(page, harness);
  harness.scope = "changed";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Other Hotel").first()).toBeVisible();
  await releaseLateA(page, harness);
  await expect(page.getByText("A-PLATE-390")).toHaveCount(0);
  await expect(page.getByText("B-PLATE-390")).toHaveCount(0);
  expect(harness.confirmations).toEqual([]);
});

test("#390 auth logout unmounts old Parking after target replacement", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const harness = await mountParkingHarness(page, fixtureUrl);
  await pendingAThenSelectB(page, harness);
  await page.evaluate(() =>
    (
      window as Window & { __issue358Logout(): Promise<void> }
    ).__issue358Logout(),
  );
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await releaseLateA(page, harness);
  await expect(page.getByText("A-PLATE-390")).toHaveCount(0);
  await expect(page.getByText("B-PLATE-390")).toHaveCount(0);
  expect(harness.confirmations).toEqual([]);
});
