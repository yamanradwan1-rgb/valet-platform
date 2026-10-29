import { expect, test, type Page } from "@playwright/test";
import {
  createScopeFixture,
  LOCATION_A,
  LOCATION_B,
  mountScopedEmployee,
  openRetainedARetrieval,
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

async function goToScope(
  page: Page,
  harness: ScopeHarness,
  scope: ScopeHarness["scope"],
) {
  harness.scope = scope;
  const before = harness.trace.context.length;
  await refreshAuthoritativeScope(page);
  await expect.poll(() => harness.trace.context.length).toBeGreaterThan(before);
  if (scope === "none")
    await expect(page.getByText("No active shift")).toBeVisible();
  else
    await expect(
      page.getByText(`${scope === "B" ? "B" : "A"} Hotel`).first(),
    ).toBeVisible();
}

test("same-login A→B retires A retrieval target and never requests stale A session in B", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const harness = await mountScopedEmployee(page, fixtureUrl);
  await openRetainedARetrieval(page);
  expect(harness.trace.session.some((entry) => entry.scope === "A")).toBe(true);

  await goToScope(page, harness, "B");
  console.info("#358 A→B mounted trace", JSON.stringify(harness.trace));
  console.info(
    "#358 A→B visible",
    JSON.stringify({
      headerB: await page.getByText("B Hotel").first().isVisible(),
      oldRetrieval: await page.getByText("Cannot resume retrieval").isVisible(),
    }),
  );
  await expect(page.getByText("Cannot resume retrieval")).toHaveCount(0);
  await expect(page.getByText("A-PLATE-358")).toHaveCount(0);
  expect(harness.trace.session.filter((entry) => entry.scope === "B")).toEqual(
    [],
  );
  expect(harness.trace.queues).toContain(LOCATION_B);
  expect(errors).toEqual([]);
});

test("same-login A→no active shift→B retires retained A target across access gate", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  await openRetainedARetrieval(page);

  await goToScope(page, harness, "none");
  await goToScope(page, harness, "B");
  console.info("#358 A→none→B mounted trace", JSON.stringify(harness.trace));
  await expect(page.getByText("Cannot resume retrieval")).toHaveCount(0);
  expect(harness.trace.session.filter((entry) => entry.scope === "B")).toEqual(
    [],
  );
  expect(harness.trace.context).toEqual(
    expect.arrayContaining(["A", "none", "B"]),
  );
});

test("same scope refresh and a temporary reconnect failure preserve the A workflow", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  await openRetainedARetrieval(page);
  const oldCalls = harness.trace.session.length;

  await refreshAuthoritativeScope(page);
  await expect(page.getByText("Cannot resume retrieval")).toBeVisible();
  harness.contextStatus = 503;
  await refreshAuthoritativeScope(page);
  await expect(page.getByText("Cannot resume retrieval")).toBeVisible();
  expect(harness.trace.session).toHaveLength(oldCalls);
  expect(harness.trace.queues).toContain(LOCATION_A);
});

test("same-user access token rotation preserves A workflow with unchanged authority", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  await openRetainedARetrieval(page);
  const before = harness.trace.session.length;
  harness.allowRefresh = true;
  await page.evaluate(() =>
    (
      window as Window & {
        __issue358RefreshToken(): Promise<unknown>;
      }
    ).__issue358RefreshToken(),
  );
  await expect(page.getByText("Cannot resume retrieval")).toBeVisible();
  await expect.poll(() => harness.trace.session.length).toBeGreaterThan(before);
  expect(harness.trace.session.every((entry) => entry.scope === "A")).toBe(
    true,
  );
});

test("revoked context hides A workflow and new B authority starts at B queue", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  await openRetainedARetrieval(page);
  harness.contextStatus = 403;
  await refreshAuthoritativeScope(page);
  await expect(
    page.getByText("Could not load operational context"),
  ).toBeVisible();
  harness.contextStatus = null;
  await goToScope(page, harness, "B");
  await expect(page.getByText("Cannot resume retrieval")).toHaveCount(0);
  expect(harness.trace.session.filter((entry) => entry.scope === "B")).toEqual(
    [],
  );
});

test("logout and new login drop A target before B becomes active", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  await openRetainedARetrieval(page);
  // Workflow BottomNav is deliberately pinned; trigger the real auth client
  // logout through the test-only fixture's control rather than inventing UI.
  await page.evaluate(() =>
    (
      window as Window & {
        __issue358Logout(): Promise<void>;
      }
    ).__issue358Logout(),
  );
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  harness.scope = "B";
  await page.locator('input[type="email"]').fill("scope@example.com");
  await page.locator('input[type="password"]').fill("Password123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("B Hotel").first()).toBeVisible();
  await expect(page.getByText("Cannot resume retrieval")).toHaveCount(0);
  expect(harness.trace.session.filter((entry) => entry.scope === "B")).toEqual(
    [],
  );
});

test("late A task acceptance cannot reopen A retrieval after B remount", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  harness.taskStatus = "ASSIGNED";
  await refreshAuthoritativeScope(page);
  await expect(page.getByRole("button", { name: "Accept Task" })).toBeVisible();
  await page.getByRole("button", { name: "Accept Task" }).click();
  await expect.poll(() => Boolean(harness.releaseAccept)).toBe(true);

  await goToScope(page, harness, "B");
  const acceptedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/accept") && response.status() === 200,
  );
  harness.releaseAccept?.();
  await acceptedResponse;
  // Let the browser process the response promise and React's next paint.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByText("Cannot resume retrieval")).toHaveCount(0);
  // A late callback is a real cross-scope hazard even if the B API correctly
  // denies stale A session hydration. It must never navigate away from B queue.
  await expect(page.getByText("B Hotel").first()).toBeVisible();
  expect(harness.trace.session.filter((entry) => entry.scope === "B")).toEqual(
    [],
  );
});

test("delayed A acceptance survives same-user token refresh at unchanged A shift", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  harness.taskStatus = "ASSIGNED";
  await refreshAuthoritativeScope(page);
  await page.getByRole("button", { name: "Accept Task" }).click();
  await expect.poll(() => Boolean(harness.releaseAccept)).toBe(true);

  harness.allowRefresh = true;
  await page.evaluate(() =>
    (
      window as Window & {
        __issue358RefreshToken(): Promise<unknown>;
      }
    ).__issue358RefreshToken(),
  );
  await expect(page.getByText("A Hotel").first()).toBeVisible();
  const acceptedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/accept") && response.status() === 200,
  );
  harness.releaseAccept?.();
  await acceptedResponse;
  await expect(page.getByText("Cannot resume retrieval")).toBeVisible();
});

test("in-flight A acceptance completing while same-scope context is pending survives revalidation", async ({
  page,
}) => {
  const harness = await mountScopedEmployee(page, fixtureUrl);
  harness.taskStatus = "ASSIGNED";
  await refreshAuthoritativeScope(page);
  await page.getByRole("button", { name: "Accept Task" }).click();
  await expect.poll(() => Boolean(harness.releaseAccept)).toBe(true);

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

  const acceptedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/accept") && response.status() === 200,
  );
  harness.releaseAccept?.();
  await acceptedResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  harness.holdContext = false;
  harness.releaseContext?.();
  await expect(page.getByText("A Hotel").first()).toBeVisible();
  await expect(page.getByText("Cannot resume retrieval")).toBeVisible();
  expect(harness.trace.session.every((entry) => entry.scope === "A")).toBe(
    true,
  );
});

for (const scope of ["A-new-shift", "A-new-membership"] as const) {
  test(`same Location ${scope} authority change retires the A task`, async ({
    page,
  }) => {
    const harness = await mountScopedEmployee(page, fixtureUrl);
    await openRetainedARetrieval(page);
    const oldCalls = harness.trace.session.length;
    await goToScope(page, harness, scope);
    await expect(page.getByText("Cannot resume retrieval")).toHaveCount(0);
    // Header Location is still A; the discriminating change is the new
    // authoritative Shift or membership, not a different venue label.
    expect(harness.trace.session).toHaveLength(oldCalls);
  });
}
