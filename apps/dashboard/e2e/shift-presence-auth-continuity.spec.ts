import { expect, test } from "@playwright/test";
import {
  continuityFixture,
  createUnknown,
  expectBlocked,
} from "./support/presence-continuity-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { ORG_A, LOCATION_A } from "./support/fixture-data";
import { PresenceFixture } from "./support/presence-fixtures";

for (const outcome of ["COMMITTED", "UNKNOWN", "FAIL"] as const) {
  test(`UNKNOWN → stale token → same-session refresh → exact GET ${outcome}`, async ({
    page,
  }) => {
    const { f, setOutcome } = continuityFixture();
    await createUnknown(page, f);
    const sessionId = f.fixture.auth.staffAuthSessionId;
    await expectBlocked(page);
    const before = f.fixture.count("/v1/staff/auth/refresh");
    setOutcome(outcome);
    await page.clock.setFixedTime(new Date("2100-01-01T00:00:00Z"));
    const receiptResponse = page.waitForResponse((response) =>
      response.url().includes("/results/"),
    );
    await page
      .getByRole("button", { name: "Retry reconciliation", exact: true })
      .click();
    await receiptResponse;
    await expect
      .poll(() => f.fixture.count("/v1/staff/auth/refresh"))
      .toBe(before + 1);
    await page.getByRole("tab", { name: "Location Overrides" }).click();
    if (outcome === "COMMITTED") {
      await expect(
        page.getByRole("button", { name: "Add zone", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "Retry reconciliation", exact: true }),
      ).toHaveCount(0);
    } else await expectBlocked(page);
    expect(f.fixture.auth.staffAuthSessionId).toBe(sessionId);
    expect(f.requests.filter((url) => url.includes("/results/"))).toHaveLength(
      2,
    );
    expect(f.writes).toHaveLength(1);
  });
}

for (const metadata of [null, "malformed"] as const) {
  test(`legacy API metadata ${metadata} preserves sign-in and reads but disables GPS-D writes`, async ({
    page,
  }) => {
    const f = new PresenceFixture("CA", (path, request, state) => {
      if (path === "/v1/staff/auth/login") {
        const reply = state.fixture.auth.login();
        return {
          ...reply,
          headers: {
            "set-cookie": reply.headers!["set-cookie"]!,
            ...(metadata === null
              ? {}
              : { "X-Vaylet-Staff-Auth-Session-Id": metadata }),
          },
        };
      }
      if (
        path === "/v1/staff/auth/refresh" &&
        state.fixture.auth.hasCookie(request)
      ) {
        const reply = state.fixture.auth.refresh(request);
        return {
          ...reply,
          headers:
            metadata === null
              ? {}
              : { "X-Vaylet-Staff-Auth-Session-Id": metadata },
        };
      }
      return undefined;
    });
    await f.open(page);
    await expect(page.getByTestId("shift-presence")).toContainText(
      "Presence changes are unavailable for this sign-in",
    );
    await expect(page.getByTestId("shift-presence")).toContainText(
      "Hotel lobby",
    );
    await expect(
      page.getByRole("button", { name: "Add zone", exact: true }),
    ).toBeDisabled();
    await expect(
      page.locator("#presence-shiftPresenceMaxAccuracyMeters"),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Retry reconciliation", exact: true }),
    ).toHaveCount(0);
    expect(f.writes).toHaveLength(0);
    expect(f.requests.filter((url) => url.includes("/results/"))).toHaveLength(
      0,
    );
  });
}

test("different session UUID on refresh purges UNKNOWN without old exact GET or presentation", async ({
  page,
}) => {
  const { f, setOutcome, replace } = continuityFixture();
  await createUnknown(page, f);
  setOutcome("COMMITTED");
  replace();
  const before = f.fixture.count("/v1/staff/auth/refresh");
  await page.clock.setFixedTime(new Date("2100-01-01T00:00:00Z"));
  await page
    .getByRole("button", { name: "Retry reconciliation", exact: true })
    .click();
  await expect
    .poll(() => f.fixture.count("/v1/staff/auth/refresh"))
    .toBe(before + 1);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await page.getByRole("tab", { name: "Location Overrides" }).click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Retry reconciliation", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("shift-presence")).not.toContainText(
    "Old exact receipt",
  );
  expect(f.requests.filter((url) => url.includes("/results/"))).toHaveLength(1);
  expect(f.writes).toHaveLength(1);
});

for (const metadata of [null, "malformed"] as const) {
  test(`UNKNOWN followed by missing/invalid header ${metadata} retires recovery but preserves auth`, async ({
    page,
  }) => {
    const state = continuityFixture();
    await createUnknown(page, state.f);
    state.metadata(metadata);
    state.setOutcome("COMMITTED");
    await page.clock.setFixedTime(new Date("2100-01-01T00:00:00Z"));
    await page
      .getByRole("button", { name: "Retry reconciliation", exact: true })
      .click();
    await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
    await page
      .getByRole("button", { name: LOCATION_A.name, exact: true })
      .click();
    await page.getByRole("tab", { name: "Location Overrides" }).click();
    await expect(page.getByTestId("shift-presence")).toContainText(
      "Presence changes are unavailable for this sign-in",
    );
    await expect(
      page.getByRole("button", { name: "Add zone", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Retry reconciliation", exact: true }),
    ).toHaveCount(0);
    expect(
      state.f.requests.filter((url) => url.includes("/results/")),
    ).toHaveLength(1);
    expect(state.f.writes).toHaveLength(1);
  });
}

test("late exact GET after same-session refresh cannot publish into a new login for the same User", async ({
  page,
}) => {
  const { f, setOutcome, hold } = continuityFixture();
  await createUnknown(page, f);
  const oldSessionId = f.fixture.auth.staffAuthSessionId;
  let signalStarted!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  setOutcome("COMMITTED");
  hold(async () => {
    signalStarted();
    await pending;
  });
  await page.clock.setFixedTime(new Date("2100-01-01T00:00:00Z"));
  await page
    .getByRole("button", { name: "Retry reconciliation", exact: true })
    .click();
  await started;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-10-05T00:00:00Z"));
  await signInOnCurrentPage(page);
  expect(f.fixture.auth.staffAuthSessionId).not.toBe(oldSessionId);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await page.getByRole("tab", { name: "Location Overrides" }).click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  release();
  await expect(page.getByTestId("shift-presence")).not.toContainText(
    "Old exact receipt",
  );
  await expect(
    page.getByRole("button", { name: "Retry reconciliation", exact: true }),
  ).toHaveCount(0);
  expect(f.requests.filter((url) => url.includes("/results/"))).toHaveLength(2);
  expect(f.writes).toHaveLength(1);
});
