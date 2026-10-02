import { expect, test } from "@playwright/test";
import {
  forceFixture,
  FORCE_BASE,
  SHIFT_X,
  SHIFT_Y,
  openForceEnd,
  fillForceEnd,
  enterForceHistory,
  errorReply,
  forceResult,
} from "./support/issue240g-force-end";
import { historyRow } from "./support/issue240e-history";
import { deferred } from "./support/staff-directory-ui";

for (const denial of [
  "STAFF_SHIFT_HISTORY_ACCESS_DENIED",
  "DASHBOARD_ACCESS_DENIED",
]) {
  test(`${denial} on POST clears identity and intent`, async ({ page }) => {
    const setup = forceFixture({ onPost: () => errorReply(denial, 403) });
    await setup.install(page);
    await enterForceHistory(page);
    await openForceEnd(page);
    const dialog = await fillForceEnd(page, "Protected private reason");
    await dialog
      .getByRole("button", { name: "Force End Shift", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(setup.posts).toHaveLength(1);
    await expect(page.getByText("Protected private reason")).toHaveCount(0);
  });
}

for (const source of ["list", "detail"] as const) {
  for (const denial of [false, true]) {
    test(`unknown reconciliation ${source} ${denial ? "denial" : "network error"} does not enable another POST`, async ({
      page,
    }) => {
      let readCount = 0;
      const setup = forceFixture({
        onPost: () => "abort",
        onRead: (path) => {
          if (
            path ===
              (source === "list" ? FORCE_BASE : `${FORCE_BASE}/${SHIFT_X}`) &&
            ++readCount > 1
          )
            return errorReply(
              denial ? "STAFF_SHIFT_HISTORY_ACCESS_DENIED" : "HTTP_ERROR",
              denial ? 403 : 503,
            );
          return undefined;
        },
      });
      await setup.install(page);
      await enterForceHistory(page);
      await openForceEnd(page);
      const dialog = await fillForceEnd(page);
      await dialog
        .getByRole("button", { name: "Force End Shift", exact: true })
        .click();
      await expect(dialog.getByRole("status")).toContainText(
        "The outcome could not be confirmed",
      );
      await dialog
        .getByRole("button", { name: "Refresh status", exact: true })
        .click();
      if (denial) await expect(page.getByRole("dialog")).toHaveCount(0);
      else {
        await expect(dialog.getByRole("status")).toContainText(
          "The outcome could not be confirmed",
        );
        await expect(
          dialog.getByRole("button", { name: "Force End Shift", exact: true }),
        ).toBeDisabled();
      }
      expect(setup.posts).toHaveLength(1);
    });
  }
}

for (const delayed of ["mfa", "reconcile"] as const) {
  for (const outcome of ["success", "failure"] as const) {
    test(`target change discards delayed ${delayed} ${outcome}`, async ({
      page,
    }) => {
      const started = deferred(),
        release = deferred();
      let detailReads = 0;
      const setup = forceFixture({
        rows: [historyRow(), historyRow({ shiftId: SHIFT_Y })],
        onPost: () =>
          delayed === "mfa" ? errorReply("MFA_STEP_UP_REQUIRED", 403) : "abort",
        onRead: async (path) => {
          if (delayed === "mfa" && path === "/v1/staff/auth/mfa/step-up") {
            started.resolve();
            await release.promise;
            return outcome === "success"
              ? { body: { state: "ASSURED" } }
              : errorReply("MFA_CODE_INVALID", 400);
          }
          if (
            delayed === "reconcile" &&
            path === `${FORCE_BASE}/${SHIFT_X}` &&
            ++detailReads === 2
          ) {
            started.resolve();
            await release.promise;
            return outcome === "success"
              ? {
                  body: historyRow({
                    status: "ENDED",
                    endedAt: "2026-10-02T08:00:00.000Z",
                  }),
                }
              : errorReply("STAFF_SHIFT_HISTORY_ACCESS_DENIED", 403);
          }
          return undefined;
        },
      });
      await setup.install(page);
      await enterForceHistory(page);
      await openForceEnd(page);
      const dialog = await fillForceEnd(page, "Old sensitive reason");
      await dialog
        .getByRole("button", { name: "Force End Shift", exact: true })
        .click();
      if (delayed === "mfa") {
        const mfa = page.getByRole("dialog", {
          name: "Verification required",
          exact: true,
        });
        await mfa.getByLabel("6-digit authenticator code").fill("123456");
        await mfa.getByRole("button", { name: "Verify", exact: true }).click();
      } else {
        await expect(dialog.getByRole("status")).toContainText(
          "The outcome could not be confirmed",
        );
        await dialog
          .getByRole("button", { name: "Refresh status", exact: true })
          .click();
      }
      await started.promise;
      await page
        .getByRole("table")
        .getByRole("button")
        .nth(1)
        .evaluate((button: HTMLButtonElement) => button.click());
      await page
        .getByRole("dialog", { name: "Shift details", exact: true })
        .getByRole("button", { name: "Force End Shift", exact: true })
        .click();
      const current = await fillForceEnd(page, "New protected intent");
      release.resolve();
      await page.waitForLoadState("networkidle");
      await expect(current.getByLabel("Reason", { exact: true })).toHaveValue(
        "New protected intent",
      );
      await expect(current.getByRole("status")).toHaveCount(0);
      await expect(
        current.getByRole("button", { name: "Force End Shift", exact: true }),
      ).toBeEnabled();
      expect(setup.posts).toHaveLength(1);
    });
  }
}

test("parsed success with failed list refresh retains safe pending-cash feedback", async ({
  page,
}) => {
  let lists = 0;
  const setup = forceFixture({
    onPost: (body) => {
      setup.state.ended = true;
      return { body: forceResult(body) };
    },
    onRead: (path) =>
      path === FORCE_BASE && ++lists > 1
        ? errorReply("HTTP_ERROR", 503)
        : undefined,
  });
  await setup.install(page);
  await enterForceHistory(page);
  await openForceEnd(page);
  const dialog = await fillForceEnd(page);
  await dialog
    .getByRole("button", { name: "Force End Shift", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "The status refresh could not be completed",
  );
  await expect(
    dialog.getByRole("button", { name: "Force End Shift", exact: true }),
  ).toHaveCount(0);
  expect(setup.posts).toHaveLength(1);
});
