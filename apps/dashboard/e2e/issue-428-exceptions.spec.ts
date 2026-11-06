import { expect, test, type Page } from "@playwright/test";
import {
  caBase,
  EXCEPTION_ID,
  lmBase,
  PresenceFixture,
  presenceException,
} from "./support/presence-fixtures";
import { LOCATION_A, LOCATION_B, ORG_A } from "./support/fixture-data";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  captureStaffRequests,
  expectCompactEmployeeTabs,
  shiftStartEndPosts,
} from "./support/issue428-route-observation";

const error = (status: number, code: string) => ({
  status,
  body: { code, message: "Controlled test response", requestId: "issue-428" },
});

async function enterEmployees(
  page: Page,
  fixture: PresenceFixture,
  locationName: string = LOCATION_A.name,
) {
  await fixture.fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page.getByRole("button", { name: locationName, exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/u);
}

async function openExceptions(page: Page, label = "Exceptions") {
  const tab = page.getByRole("button", { name: label, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/employees$/u);
  return page.getByTestId("presence-exceptions");
}

async function changeScope(page: Page, name: string) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .click();
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/employees$/u);
}

for (const authority of ["CA", "LM"] as const) {
  test(`${authority} opens Pending and exact detail from mounted Employees Exceptions tab`, async ({
    page,
  }) => {
    const f = new PresenceFixture(authority);
    await enterEmployees(page, f);
    await expect(page.getByTestId("presence-exceptions")).toHaveCount(0);
    const section = await openExceptions(page);
    await expect(section).toContainText("Nadia Salem");
    await expect(section).toContainText("nadia@example.com");
    await expect(section).toContainText(LOCATION_A.name);
    await expect(section.getByRole("button", { name: "Pending" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await section.getByRole("button", { name: "Review", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Review Presence Exception",
    });
    await expect(dialog).toContainText("Nadia Salem");
    await expect(dialog).toContainText("Outside attendance zone");
    await expect(dialog).toContainText("Approval does not start or end the Shift");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const base = authority === "CA" ? caBase : lmBase;
    expect(f.requests.some((url) => url.includes(`${base}/exceptions?`))).toBe(true);
    expect(f.fixture.count(`${base}/exceptions/${EXCEPTION_ID}`)).toBe(1);
    expect(f.writes).toHaveLength(0);
    await expect(page.getByRole("link", { name: "Exceptions", exact: true })).toHaveCount(0);
  });
}

for (const action of ["approve", "reject"] as const) {
  test(`${action} submits one revision-bound decision and history remains read-only`, async ({
    page,
  }) => {
    const allStaffRequests = captureStaffRequests(page);
    const f = new PresenceFixture("LM");
    await enterEmployees(page, f);
    const section = await openExceptions(page);
    await section.getByRole("button", { name: "Review", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: action === "approve" ? "Approve" : "Reject" })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]!.path).toBe(`${lmBase}/exceptions/${EXCEPTION_ID}/${action}`);
    expect(f.writes[0]!.body).toMatchObject({
      expectedRevision: 1,
      mutationId: expect.any(String),
    });
    expect(f.writes[0]!.body).not.toHaveProperty("locationId");
    expect(shiftStartEndPosts(allStaffRequests)).toEqual([]);

    await section.getByRole("button", { name: "History", exact: true }).click();
    await expect(section).toContainText(action === "approve" ? "Approved" : "Rejected");
    await section.getByRole("button", { name: "Details", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "This request is read-only in its current state",
    );
    await expect(page.getByRole("dialog").getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("button", { name: "Reject" })).toHaveCount(0);
    expect(shiftStartEndPosts(allStaffRequests)).toEqual([]);
  });
}

test("a server MFA step-up rejection does not approve or silently retry", async ({
  page,
}) => {
  const allStaffRequests = captureStaffRequests(page);
  const f = new PresenceFixture("CA", (path, request, state) =>
    path === `${caBase}/exceptions/${EXCEPTION_ID}/approve` &&
    request.method() === "POST" &&
    !state.fixture.mfaAssured
      ? error(403, "MFA_STEP_UP_REQUIRED")
      : undefined,
  );
  await enterEmployees(page, f);
  f.fixture.mfaState = "STEP_UP_REQUIRED";
  f.fixture.mfaAssured = false;
  const section = await openExceptions(page);
  await section.getByRole("button", { name: "Review", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review Presence Exception" });
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  const mfa = page.getByRole("dialog", { name: "Verification required" });
  await expect(mfa).toBeVisible();
  expect(f.exceptions[0]!.status).toBe("PENDING");
  expect(f.writes[0]!.path).toBe(`${caBase}/exceptions/${EXCEPTION_ID}/approve`);
  await mfa.getByLabel("Authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(mfa).toHaveCount(0);
  await expect(review).toContainText("Verification completed. Review refreshed state and submit explicitly.");
  expect(f.writes).toHaveLength(1);
  expect(f.exceptions[0]!.status).toBe("PENDING");
  expect(shiftStartEndPosts(allStaffRequests)).toEqual([]);
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(review).toHaveCount(0);
  expect(f.writes).toHaveLength(2);
  expect(f.writes[1]!.body.mutationId).not.toBe(f.writes[0]!.body.mutationId);
  expect(f.exceptions[0]!.status).toBe("APPROVED");
  expect(shiftStartEndPosts(allStaffRequests)).toEqual([]);
});

test("Company All Locations has no exception list or cross-location request", async ({
  page,
}) => {
  const f = new PresenceFixture("CA");
  await enterEmployees(page, f, "All Locations");
  await openExceptions(page);
  await expect(page.getByTestId("presence-exceptions")).toHaveCount(0);
  expect(f.requests.filter((url) => url.includes("/exceptions"))).toHaveLength(0);
  await changeScope(page, LOCATION_A.name);
  const section = await openExceptions(page);
  await expect(section).toContainText("Nadia Salem");
});

test("changing exact Location A → B → A never exposes A's pending requests in B", async ({
  page,
}) => {
  const f = new PresenceFixture("LM", (path, request) =>
    path.includes(LOCATION_B.locationId) &&
    path.endsWith("/exceptions") &&
    request.method() === "GET"
      ? { body: { items: [], nextCursor: null } }
      : undefined,
  );
  await enterEmployees(page, f);
  await expect(await openExceptions(page)).toContainText("Nadia Salem");
  await changeScope(page, LOCATION_B.name);
  const other = await openExceptions(page);
  await expect(other).toContainText("No pending presence exceptions");
  await expect(other).not.toContainText("Nadia Salem");
  expect(f.requests.some((url) => url.includes(LOCATION_B.locationId))).toBe(true);
  await changeScope(page, LOCATION_A.name);
  await expect(await openExceptions(page)).toContainText("Nadia Salem");
  expect(f.writes).toHaveLength(0);
});

test("Arabic mounted Exceptions view translates labels and preserves requester identity", async ({
  page,
}) => {
  const f = new PresenceFixture("CA");
  await enterEmployees(page, f);
  await page.evaluate(() => {
    localStorage.setItem("vaylet_dashboard_locale", "ar");
    window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
  });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const section = await openExceptions(page, "الاستثناءات");
  await expect(section).toContainText("Nadia Salem");
  await expect(section).toContainText("قيد الانتظار");
  await section.getByRole("button", { name: "مراجعة", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "مراجعة استثناء الحضور" })).toContainText(
    "الموافقة لا تبدأ المناوبة ولا تنهيها",
  );
});

test("failed list read hides private rows until explicit retry", async ({ page }) => {
  let failing = true;
  const f = new PresenceFixture("LM", (path, request) =>
    path === `${lmBase}/exceptions` && request.method() === "GET" && failing
      ? error(503, "SERVER_ERROR")
      : undefined,
  );
  await enterEmployees(page, f);
  const section = await openExceptions(page);
  await expect(section).toContainText("Could not read current state");
  await expect(section).not.toContainText("nadia@example.com");
  failing = false;
  await section.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(section).toContainText("nadia@example.com");
  expect(f.writes).toHaveLength(0);
});

test("authorization denial on refreshed list conceals previous employee details", async ({
  page,
}) => {
  let denied = false;
  const f = new PresenceFixture("LM", (path, request) =>
    path === `${lmBase}/exceptions` && request.method() === "GET" && denied
      ? error(403, "PRESENCE_SCOPE_DENIED")
      : undefined,
  );
  await enterEmployees(page, f);
  const section = await openExceptions(page);
  await expect(section).toContainText("nadia@example.com");
  denied = true;
  await section.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(section).not.toContainText("nadia@example.com");
  await expect(section).toContainText("Could not read current state");
  expect(f.writes).toHaveLength(0);
});

test("terminal History statuses preserve read-only canonical decisions", async ({
  page,
}) => {
  const f = new PresenceFixture("LM");
  const base = presenceException();
  f.exceptions = (["APPROVED", "REJECTED", "EXPIRED", "CONSUMED"] as const).map(
    (status, index) => ({
      ...base,
      exceptionId: `dddddddd-dddd-4ddd-8ddd-ddddddddddd${index}`,
      status,
      revision: 2,
      canReview: false,
      reviewedAt: base.requestedAt,
      terminalAt: status === "EXPIRED" || status === "CONSUMED" ? base.requestedAt : null,
    }),
  );
  await enterEmployees(page, f);
  const section = await openExceptions(page);
  await expect(section).toContainText("No pending presence exceptions");
  await section.getByRole("button", { name: "History", exact: true }).click();
  for (const label of ["Approved", "Rejected", "Expired", "Consumed"])
    await expect(section).toContainText(label);
  expect(f.writes).toHaveLength(0);
});

for (const width of [320, 390]) {
  test(`Employees, Shifts and Exceptions tabs remain usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const f = new PresenceFixture("CA");
    await enterEmployees(page, f);
    await expect(await openExceptions(page)).toContainText("Nadia Salem");
    await expectCompactEmployeeTabs(page, width);
  });
}
