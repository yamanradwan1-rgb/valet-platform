import { expect, test, type Page } from "@playwright/test";
import {
  createScopeFixture,
  mountScopedEmployee,
  refreshAuthoritativeScope,
  type ScopeHarness,
} from "./issue358-scope-browser-support";

let fixtureUrl: string;
let closeFixture: () => Promise<void>;

test.beforeAll(async () => {
  const fixture = await createScopeFixture();
  fixtureUrl = fixture.fixtureUrl;
  closeFixture = fixture.close;
});

test.afterAll(async () => closeFixture?.());

async function submitEndShift(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Shift", exact: true }).click();
  await page.locator("#end-shift-cash-reported").fill("0");
  await page.getByRole("button", { name: "End Shift", exact: true }).click();
  await page.getByRole("button", { name: "Confirm end shift" }).click();
}

async function moveScope(
  page: Page,
  harness: ScopeHarness,
  scope: ScopeHarness["scope"],
): Promise<void> {
  const count = harness.trace.context.length;
  harness.scope = scope;
  await refreshAuthoritativeScope(page);
  await expect.poll(() => harness.trace.context.length).toBeGreaterThan(count);
}

test("uncertain A End Shift survives A→none but is retired after B then none", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  harness.endShiftMode = "abort";
  await submitEndShift(page);
  await expect(
    page.getByRole("button", { name: "Retry end shift" }),
  ).toBeVisible();

  await moveScope(page, harness, "none");
  await expect(page.getByText("Confirm your end shift result")).toBeVisible();
  await moveScope(page, harness, "B");
  await expect(page.getByText("B Hotel").first()).toBeVisible();
  await expect(page.getByText("Confirm your end shift result")).toHaveCount(0);
  await moveScope(page, harness, "none");
  await expect(page.getByText("No active shift")).toBeVisible();
  await expect(page.getByText("Confirm your end shift result")).toHaveCount(0);
  expect(harness.trace.endShifts).toHaveLength(1);
  expect(harness.trace.endShifts[0]?.scope).toBe("A");
});

test("late A End Shift result never appears as success under B authority", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  harness.endShiftMode = "hold";
  await submitEndShift(page);
  await expect.poll(() => Boolean(harness.releaseEndShift)).toBe(true);

  await moveScope(page, harness, "B");
  await expect(page.getByText("B Hotel").first()).toBeVisible();
  const endedResponse = page.waitForResponse(
    (response) => response.url().endsWith("/end") && response.status() === 200,
  );
  harness.releaseEndShift?.();
  await endedResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByText("Shift ended")).toHaveCount(0);
  await expect(page.getByText("B Hotel").first()).toBeVisible();
  await moveScope(page, harness, "none");
  await expect(page.getByText("No active shift")).toBeVisible();
});

test("same-scope pending token revalidation keeps in-flight A End Shift completion", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  harness.endShiftMode = "hold";
  await submitEndShift(page);
  await expect.poll(() => Boolean(harness.releaseEndShift)).toBe(true);

  harness.holdContext = true;
  harness.allowRefresh = true;
  await page.evaluate(() =>
    (
      window as Window & {
        __issue358RefreshToken(): Promise<unknown>;
      }
    ).__issue358RefreshToken(),
  );
  await expect.poll(() => Boolean(harness.releaseContext)).toBe(true);

  const endedResponse = page.waitForResponse(
    (response) => response.url().endsWith("/end") && response.status() === 200,
  );
  harness.releaseEndShift?.();
  await endedResponse;
  harness.holdContext = false;
  harness.releaseContext?.();
  await expect(page.getByText("A Hotel").first()).toBeVisible();
  await expect(page.getByText("Shift ended")).toBeVisible();
  expect(harness.trace.endShifts).toHaveLength(1);
});
