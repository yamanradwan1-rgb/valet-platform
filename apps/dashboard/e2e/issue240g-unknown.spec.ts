import { expect, test } from "@playwright/test";
import {
  forceFixture,
  FORCE_BASE,
  SHIFT_X,
  openForceEnd,
  fillForceEnd,
  enterForceHistory,
  forceResult,
  errorReply,
} from "./support/issue240g-force-end";

for (const transport of ["abort", "malformed"] as const) {
  for (const committed of [false, true]) {
    test(`${transport} outcome unknown; explicit read finds ${committed ? "ENDED" : "ACTIVE"}`, async ({
      page,
    }) => {
      const setup = forceFixture({
        onPost: (body) => {
          if (setup.posts.length > 1) {
            setup.state.ended = true;
            return { body: forceResult(body) };
          }
          setup.state.ended = committed;
          return transport === "abort" ? "abort" : { body: { invalid: true } };
        },
      });
      await setup.install(page);
      await enterForceHistory(page);
      await openForceEnd(page);
      const dialog = await fillForceEnd(page);
      const list = setup.fixture.count(FORCE_BASE);
      await dialog
        .getByRole("button", { name: "Force End Shift", exact: true })
        .click();
      await expect(dialog.getByRole("status")).toContainText(
        "The outcome could not be confirmed",
      );
      expect(setup.posts).toHaveLength(1);
      expect(setup.fixture.count(FORCE_BASE)).toBe(list);
      expect(setup.fixture.count(`${FORCE_BASE}/${SHIFT_X}`)).toBe(1);
      await expect(dialog.getByLabel("Reason", { exact: true })).toBeDisabled();
      await dialog
        .getByRole("button", { name: "Refresh status", exact: true })
        .click();
      await expect(dialog.getByRole("status")).toContainText(
        committed
          ? "The refreshed shift is ended"
          : "The refreshed shift is active",
      );
      expect(setup.posts).toHaveLength(1);
      expect(setup.fixture.count(FORCE_BASE)).toBe(list + 1);
      expect(setup.fixture.count(`${FORCE_BASE}/${SHIFT_X}`)).toBe(2);
      if (committed) {
        await expect(
          dialog.getByRole("button", { name: "Retry same operation" }),
        ).toHaveCount(0);
      } else {
        await dialog
          .getByRole("button", { name: "Retry same operation", exact: true })
          .click();
        await expect(dialog.getByRole("status")).toContainText(
          "Shift ended administratively",
        );
        expect(setup.posts).toHaveLength(2);
        expect(setup.posts[0]).toEqual(setup.posts[1]);
      }
    });
  }
}

for (const code of ["SHIFT_ALREADY_ENDED", "IDEMPOTENCY_CONFLICT"] as const) {
  test(`${code} requires explicit reconciliation and never auto-generates another operation`, async ({
    page,
  }) => {
    const setup = forceFixture({
      onPost: () => {
        setup.state.ended = true;
        return errorReply(code);
      },
    });
    await setup.install(page);
    await enterForceHistory(page);
    await openForceEnd(page);
    const dialog = await fillForceEnd(page);
    const list = setup.fixture.count(FORCE_BASE);
    await dialog
      .getByRole("button", { name: "Force End Shift", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      code === "SHIFT_ALREADY_ENDED"
        ? "already ended"
        : "conflicts with an earlier request",
    );
    expect(setup.fixture.count(FORCE_BASE)).toBe(list);
    expect(setup.posts).toHaveLength(1);
    await dialog.getByRole("button", { name: "Refresh status" }).click();
    await expect(dialog.getByRole("status")).toContainText(
      "The refreshed shift is ended",
    );
    expect(setup.posts).toHaveLength(1);
  });
}

test("401 refresh requests explicit retry with the same in-memory operation", async ({
  page,
}) => {
  const setup = forceFixture({
    onPost: (body) => {
      if (setup.posts.length === 1)
        return errorReply("STAFF_AUTHENTICATION_REQUIRED", 401);
      setup.state.ended = true;
      return { body: forceResult(body) };
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
    "Authentication was refreshed",
  );
  expect(setup.posts).toHaveLength(1);
  await dialog
    .getByRole("button", { name: "Force End Shift", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Shift ended administratively",
  );
  expect(setup.posts).toHaveLength(2);
  expect(setup.posts[0]).toEqual(setup.posts[1]);
});
