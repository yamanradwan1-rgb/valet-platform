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
    await page.addInitScript(() => {
      const allocate = crypto.randomUUID.bind(crypto);
      const recorder = window as Window & { forceEndUuidCalls: number };
      recorder.forceEndUuidCalls = 0;
      crypto.randomUUID = () => {
        recorder.forceEndUuidCalls += 1;
        return allocate();
      };
    });
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
    const submitted = { ...setup.posts[0]! };
    const allocations = await page.evaluate(
      () =>
        (window as Window & { forceEndUuidCalls: number }).forceEndUuidCalls,
    );
    expect(allocations).toBeGreaterThan(0);
    const reason = dialog.getByLabel("Reason", { exact: true });
    const confirmation = dialog.getByRole("checkbox");
    const submit = dialog.getByRole("button", {
      name: "Force End Shift",
      exact: true,
    });
    const refresh = dialog.getByRole("button", {
      name: "Refresh status",
      exact: true,
    });
    await expect(reason).toBeDisabled();
    await expect(confirmation).toBeDisabled();
    await expect(submit).toBeDisabled();
    await expect(refresh).toBeEnabled();
    // Native pointer/keyboard attempts must not escape the conflict phase.
    const bounds = await reason.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.click(bounds!.x + 6, bounds!.y + 6);
    await page.keyboard.type("AttemptedConflictBypass");
    for (const control of [confirmation, submit]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    }
    await expect(reason).toHaveValue(String(submitted.reason));
    await expect(confirmation).toBeChecked();
    await expect(submit).toBeDisabled();
    await expect(dialog.getByRole("status")).toContainText(
      code === "SHIFT_ALREADY_ENDED"
        ? "already ended"
        : "conflicts with an earlier request",
    );
    expect(setup.posts).toEqual([submitted]);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { forceEndUuidCalls: number }).forceEndUuidCalls,
      ),
    ).toBe(allocations);
    expect(setup.fixture.count(FORCE_BASE)).toBe(list);
    expect(setup.fixture.count(`${FORCE_BASE}/${SHIFT_X}`)).toBe(1);
    await refresh.click();
    await expect(dialog.getByRole("status")).toContainText(
      "The refreshed shift is ended",
    );
    expect(setup.posts).toHaveLength(1);
    expect(setup.fixture.count(FORCE_BASE)).toBe(list + 1);
    expect(setup.fixture.count(`${FORCE_BASE}/${SHIFT_X}`)).toBe(2);
    await expect(
      dialog.getByRole("button", { name: "Retry same operation", exact: true }),
    ).toHaveCount(0);
    await expect(submit).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { forceEndUuidCalls: number }).forceEndUuidCalls,
      ),
    ).toBe(allocations);
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
