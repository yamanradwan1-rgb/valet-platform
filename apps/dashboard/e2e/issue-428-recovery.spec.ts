import { expect, test, type Page } from "@playwright/test";
import {
  EXCEPTION_ID,
  lmBase,
  PresenceFixture,
  presenceException,
} from "./support/presence-fixtures";
import { LOCATION_A, LOCATION_B, ORG_A } from "./support/fixture-data";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  captureStaffRequests,
  shiftStartEndPosts,
} from "./support/issue428-route-observation";

const error = (status: number, code: string) => ({
  status,
  body: { code, message: "Controlled test response", requestId: "issue-428" },
});

async function openMountedExceptions(page: Page, fixture: PresenceFixture) {
  await fixture.fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  await page.getByRole("button", { name: "Exceptions", exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/u);
  const list = page.getByTestId("presence-exceptions");
  await expect(list).toContainText("Nadia Salem");
  return list;
}

async function selectLocation(page: Page, name: string) {
  await page.locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true }).click();
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Exceptions", exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/u);
  return page.getByTestId("presence-exceptions");
}

test("mounted review UNKNOWN reconciles exact receipt without a duplicate approval POST", async ({
  page,
}) => {
  const allStaffRequests = captureStaffRequests(page);
  let mutationId = "";
  let result: "UNKNOWN" | "FAIL" | "COMMITTED" = "UNKNOWN";
  let receiptReads = 0;
  const f = new PresenceFixture("LM", (path, request, state) => {
    if (
      path === `${lmBase}/exceptions/${EXCEPTION_ID}/approve` &&
      request.method() === "POST"
    ) {
      mutationId = request.postDataJSON().mutationId;
      return error(503, "SERVER_ERROR");
    }
    if (path !== `${lmBase}/results/${mutationId}` || request.method() !== "GET")
      return undefined;
    receiptReads += 1;
    const query = new URL(request.url()).searchParams;
    expect(query.get("kind")).toBe("EXCEPTION");
    expect(query.get("entityId")).toBe(EXCEPTION_ID);
    if (result === "FAIL") return error(503, "SERVER_ERROR");
    if (result === "COMMITTED") {
      state.exceptions[0] = {
        ...state.exceptions[0]!,
        status: "APPROVED",
        revision: 2,
        reviewedAt: new Date().toISOString(),
        canReview: false,
      };
    }
    return {
      body: {
        mutationId,
        attribution: result,
        effect: result === "COMMITTED" ? "CHANGED" : null,
        entityId: result === "COMMITTED" ? EXCEPTION_ID : null,
        revision: result === "COMMITTED" ? 2 : null,
        canonical: { kind: "EXCEPTION", value: state.exceptions[0] },
      },
    };
  });
  const list = await openMountedExceptions(page, f);
  await list.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review Presence Exception" });
  await dialog.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(dialog).toContainText("outcome of your request is unknown");
  await expect(dialog.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(f.writes).toHaveLength(1);
  expect(f.exceptions[0]!.status).toBe("PENDING");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  result = "FAIL";
  const reconcile = page.getByRole("button", {
    name: "Retry reconciliation",
    exact: true,
  });
  await expect(reconcile).toBeEnabled();
  await reconcile.click();
  await expect(reconcile).toBeEnabled();
  expect(f.writes).toHaveLength(1);
  result = "COMMITTED";
  await reconcile.click();
  await expect(reconcile).toHaveCount(0);
  await list.getByRole("button", { name: "History", exact: true }).click();
  await expect(list).toContainText("Approved");
  expect(receiptReads).toBe(3);
  expect(f.writes).toHaveLength(1);
  expect(shiftStartEndPosts(allStaffRequests)).toEqual([]);
});

test("delayed A Pending refresh cannot repopulate B or restored A with a stale row", async ({
  page,
}) => {
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const requested = new Promise<void>((resolve) => { started = resolve; });
  let delayA = false;
  const f = new PresenceFixture("LM", async (path, request) => {
    if (path.includes(LOCATION_B.locationId) && path.endsWith("/exceptions"))
      return { body: { items: [], nextCursor: null } };
    if (
      delayA &&
      path === `${lmBase}/exceptions` &&
      request.method() === "GET"
    ) {
      delayA = false;
      started();
      await held;
      return {
        body: {
          items: [{
            ...presenceException(),
            requester: { ...presenceException().requester, firstName: "Stale" },
          }],
          nextCursor: null,
        },
      };
    }
    return undefined;
  });
  const list = await openMountedExceptions(page, f);
  delayA = true;
  await list.getByRole("button", { name: "Refresh", exact: true }).click();
  await requested;
  try {
    const other = await selectLocation(page, LOCATION_B.name);
    await expect(other).toContainText("No pending presence exceptions");
    await expect(other).not.toContainText("Nadia Salem");
    const restored = await selectLocation(page, LOCATION_A.name);
    await expect(restored).toContainText("Nadia Salem");
    release();
    await expect(restored).not.toContainText("Stale Salem");
    expect(f.writes).toHaveLength(0);
  } finally {
    release();
  }
});
