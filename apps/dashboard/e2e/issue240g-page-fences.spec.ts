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

for (const change of ["filter-ABA", "cursor"] as const) {
  for (const outcome of ["success", "failure"] as const) {
    test(`${change} discards late mutation ${outcome} and preserves current target/busy/cursor`, async ({
      page,
    }) => {
      const started = deferred(),
        release = deferred();
      const setup = forceFixture({
        rows: [historyRow(), historyRow({ shiftId: SHIFT_Y })],
        onRead: (path, request) => {
          if (path === FORCE_BASE) {
            const second = new URL(request.url()).searchParams.has("cursor");
            return {
              body: {
                items: [historyRow({ shiftId: second ? SHIFT_Y : SHIFT_X })],
                nextCursor: second ? null : "synthetic-second-page",
              },
            };
          }
          return undefined;
        },
        onPost: async (body) => {
          started.resolve();
          await release.promise;
          return outcome === "success"
            ? { body: forceResult(body) }
            : errorReply("OPEN_TASK_HANDOFF_REQUIRED");
        },
      });
      await setup.install(page);
      await enterForceHistory(page);
      await openForceEnd(page);
      const old = await fillForceEnd(page, "Discarded page intent");
      await old
        .getByRole("button", { name: "Force End Shift", exact: true })
        .click();
      await started.promise;
      if (change === "filter-ABA") {
        const status = page.getByRole("combobox", {
          name: "Status",
          exact: true,
        });
        await status.selectOption("ACTIVE");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await status.selectOption("ALL");
      } else
        await page
          .getByRole("button", { name: "Next", exact: true })
          .evaluate((button: HTMLButtonElement) => button.click());
      await expect(page.getByRole("table")).toBeVisible();
      await openForceEnd(page);
      const current = await fillForceEnd(page, "Current page intent");
      const reads = setup.fixture.count(FORCE_BASE);
      release.resolve();
      await page.waitForLoadState("networkidle");
      await expect(current.getByLabel("Reason", { exact: true })).toHaveValue(
        "Current page intent",
      );
      await expect(current.getByRole("status")).toHaveCount(0);
      await expect(
        current.getByRole("button", { name: "Force End Shift", exact: true }),
      ).toBeEnabled();
      if (change === "cursor")
        await expect(
          page.getByRole("button", { name: "Previous", exact: true }),
        ).toBeEnabled();
      expect(setup.fixture.count(FORCE_BASE)).toBe(reads);
      expect(setup.posts).toHaveLength(1);
    });
  }
}

test("page-two success resets cursor history with one list/detail refresh and retains its selected detail", async ({
  page,
}) => {
  const cursors: Array<string | null> = [];
  const setup = forceFixture({
    rows: [historyRow(), historyRow({ shiftId: SHIFT_Y })],
    onRead: (path, request) => {
      if (path === FORCE_BASE) {
        const cursor = new URL(request.url()).searchParams.get("cursor");
        cursors.push(cursor);
        return {
          body: {
            items: [historyRow({ shiftId: cursor ? SHIFT_Y : SHIFT_X })],
            nextCursor: cursor ? null : "synthetic-second-page",
          },
        };
      }
      if (path === `${FORCE_BASE}/${SHIFT_Y}`)
        return {
          body: historyRow({
            shiftId: SHIFT_Y,
            status: setup.state.ended ? "ENDED" : "ACTIVE",
            endedAt: setup.state.ended ? "2026-10-02T08:00:00.000Z" : null,
          }),
        };
      return undefined;
    },
    onPost: (body) => {
      setup.state.ended = true;
      return { body: forceResult(body, SHIFT_Y) };
    },
  });
  await setup.install(page);
  await enterForceHistory(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeEnabled();
  await openForceEnd(page);
  const dialog = await fillForceEnd(page);
  await dialog
    .getByRole("button", { name: "Force End Shift", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Shift ended administratively",
  );
  expect(cursors).toEqual([null, "synthetic-second-page", null]);
  expect(setup.fixture.count(`${FORCE_BASE}/${SHIFT_Y}`)).toBe(2);
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  expect(setup.posts).toHaveLength(1);
});

test("a programmatic overlength reason cannot bypass the shared browser validation", async ({
  page,
}) => {
  const setup = forceFixture();
  await setup.install(page);
  await enterForceHistory(page);
  await openForceEnd(page);
  const dialog = await fillForceEnd(page);
  await dialog
    .getByLabel("Reason", { exact: true })
    .evaluate((node: HTMLTextAreaElement) => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(node, "x".repeat(501));
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await expect(
    dialog.getByRole("button", { name: "Force End Shift", exact: true }),
  ).toBeDisabled();
  expect(setup.posts).toHaveLength(0);
});
