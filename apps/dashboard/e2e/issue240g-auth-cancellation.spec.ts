import { expect, test } from "@playwright/test";
import {
  forceFixture,
  enterForceHistory,
  openForceEnd,
  fillForceEnd,
  errorReply,
  forceResult,
} from "./support/issue240g-force-end";
import { deferred } from "./support/staff-directory-ui";

test("consumed auth retry cannot resurrect after cancel and tab navigation", async ({
  page,
}) => {
  const setup = forceFixture({
    onPost: (body) =>
      setup.posts.length === 1
        ? errorReply("STAFF_AUTHENTICATION_REQUIRED", 401)
        : { body: forceResult(body) },
  });
  await setup.install(page);
  await enterForceHistory(page);
  await openForceEnd(page);
  const dialog = await fillForceEnd(page, "Same canonical reason");
  await dialog
    .getByRole("button", { name: "Force End Shift", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Authentication was refreshed",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Employees", exact: true }).click();
  await page.getByRole("button", { name: "Shifts", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const fresh = await openForceEnd(page);
  await expect(fresh.getByLabel("Reason", { exact: true })).toHaveValue("");
  await expect(fresh.getByRole("checkbox")).not.toBeChecked();
  await fillForceEnd(page, "Same canonical reason");
  await fresh
    .getByRole("button", { name: "Force End Shift", exact: true })
    .click();
  await expect(fresh.getByRole("status")).toContainText(
    "Shift ended administratively",
  );
  expect(setup.posts).toHaveLength(2);
  expect(setup.posts[0]!.operationId).not.toBe(setup.posts[1]!.operationId);
});

test("cancelled pending POST cannot restore its reason after later auth reconciliation", async ({
  page,
}) => {
  const started = deferred(),
    release = deferred();
  const setup = forceFixture({
    onPost: async () => {
      started.resolve();
      await release.promise;
      return errorReply("STAFF_AUTHENTICATION_REQUIRED", 401);
    },
  });
  await setup.install(page);
  await enterForceHistory(page);
  await openForceEnd(page);
  const dialog = await fillForceEnd(page, "Cancelled reason");
  await dialog
    .getByRole("button", { name: "Force End Shift", exact: true })
    .click();
  await started.promise;
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  release.resolve();
  await expect
    .poll(() => setup.fixture.count("/v1/staff/auth/refresh"))
    .toBe(1);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Cancelled reason", { exact: true })).toHaveCount(
    0,
  );
  expect(setup.posts).toHaveLength(1);
});
