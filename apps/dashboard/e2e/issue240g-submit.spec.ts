import { expect, test } from "@playwright/test";
import {
  forceFixture,
  FORCE_BASE,
  SHIFT_X,
  openForceEnd,
  fillForceEnd,
  enterForceHistory,
  errorReply,
  forceResult,
  syntheticReason,
} from "./support/issue240g-force-end";
import { deferred } from "./support/staff-directory-ui";

for (const manager of [false, true]) {
  test(`${manager ? "LM" : "CA"} confirmation/MFA/explicit retry/bounded success`, async ({
    page,
  }) => {
    const setup = forceFixture({
      manager,
      onPost: (body) => {
        if (setup.posts.length === 1)
          return errorReply("MFA_STEP_UP_REQUIRED", 403);
        setup.state.ended = true;
        return { body: forceResult(body) };
      },
    });
    await setup.install(page);
    await enterForceHistory(page, manager);
    const listBefore = setup.fixture.count(FORCE_BASE);
    await openForceEnd(page);
    const dialog = await fillForceEnd(page, "   ");
    const submit = dialog.getByRole("button", {
      name: "Force End Shift",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await expect(dialog.getByLabel("Reason", { exact: true })).toHaveAttribute(
      "maxLength",
      "500",
    );
    await dialog
      .getByLabel("Reason", { exact: true })
      .fill(`  ${syntheticReason}  `);
    await submit.click();
    const mfa = page.getByRole("dialog", {
      name: "Verification required",
      exact: true,
    });
    await mfa.getByLabel("6-digit authenticator code").fill("123456");
    await mfa.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(mfa).toHaveCount(0);
    await expect(dialog.getByRole("status")).toContainText(
      "Verification is complete",
    );
    expect(setup.posts).toHaveLength(1);
    expect(setup.fixture.count(FORCE_BASE)).toBe(listBefore);
    expect(setup.fixture.count(`${FORCE_BASE}/${SHIFT_X}`)).toBe(1);
    await submit.click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Shift ended administratively. Cash reconciliation remains pending.",
    );
    expect(setup.posts).toHaveLength(2);
    expect(setup.posts[0]).toEqual(setup.posts[1]);
    expect(setup.posts[1]!.reason).toBe(syntheticReason);
    expect(setup.fixture.count(FORCE_BASE)).toBe(listBefore + 1);
    expect(setup.fixture.count(`${FORCE_BASE}/${SHIFT_X}`)).toBe(2);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Shift details" }),
    ).toContainText("Ended");
    await expect(
      page.getByRole("button", { name: "Force End Shift", exact: true }),
    ).toHaveCount(0);
    expect(
      [...setup.fixture.counts.keys()].some((path) =>
        /audit|active-shifts|\/tasks/.test(path),
      ),
    ).toBe(false);
  });
}

test("double-submit is fenced; blocker retains operation; changed material rotates", async ({
  page,
}) => {
  const barrier = deferred();
  const setup = forceFixture({
    onPost: async () => {
      await barrier.promise;
      return errorReply("OPEN_TASK_HANDOFF_REQUIRED");
    },
  });
  await setup.install(page);
  await enterForceHistory(page);
  await openForceEnd(page);
  const dialog = await fillForceEnd(page);
  const submit = dialog.getByRole("button", {
    name: "Force End Shift",
    exact: true,
  });
  await submit.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => setup.posts.length).toBe(1);
  await expect(
    dialog.getByRole("button", { name: "Ending shift…", exact: true }),
  ).toBeDisabled();
  barrier.resolve();
  await expect(dialog.getByRole("status")).toContainText(
    "Open tasks require handoff",
  );
  await submit.click();
  await expect.poll(() => setup.posts.length).toBe(2);
  await expect(submit).toBeEnabled();
  expect(setup.posts[0]).toEqual(setup.posts[1]);
  await dialog.getByLabel("Reason", { exact: true }).fill("Changed material");
  await submit.click();
  await expect.poll(() => setup.posts.length).toBe(3);
  expect(setup.posts[2]!.operationId).not.toBe(setup.posts[0]!.operationId);
});
