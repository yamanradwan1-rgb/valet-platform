import { expect, test } from "@playwright/test";
import {
  PresenceFixture,
  attendanceZone,
  presenceException,
  lmBase,
  ZONE_ID,
} from "./support/presence-fixtures";

test("zone and exception paging are bounded server pages, never client accumulation", async ({
  page,
}) => {
  const f = new PresenceFixture("LM", (path, request) => {
    const cursor = new URL(request.url()).searchParams.get("cursor");
    if (path === `${lmBase}/zones` || path === `${lmBase}/exceptions`) {
      expect(new URL(request.url()).searchParams.get("limit")).toBe("25");
      const zone = {
        ...attendanceZone(),
        label: cursor ? "Second zone" : "First zone",
      };
      const exception = {
        ...presenceException(),
        requester: {
          ...presenceException().requester,
          firstName: cursor ? "Second" : "First",
        },
      };
      return {
        body: {
          items: path.endsWith("/zones") ? [zone] : [exception],
          nextCursor: cursor ? null : ZONE_ID,
        },
      };
    }
    return undefined;
  });
  await f.open(page);
  for (const [testId, first, second] of [
    ["presence-zones", "First zone", "Second zone"],
    ["presence-exceptions", "First Salem", "Second Salem"],
  ]) {
    const section = page.getByTestId(testId!);
    await expect(section).toContainText(first!);
    await section.getByRole("button", { name: "Next", exact: true }).click();
    await expect(section).toContainText(second!);
    await expect(section).not.toContainText(first!);
    await expect(
      section.getByRole("button", { name: "Next", exact: true }),
    ).toBeDisabled();
    await section
      .getByRole("button", { name: "Previous", exact: true })
      .click();
    await expect(section).toContainText(first!);
  }
  expect(f.writes).toHaveLength(0);
});

test("history preserves every canonical terminal status and has no mutation controls", async ({
  page,
}) => {
  const f = new PresenceFixture();
  const base = presenceException();
  f.exceptions = (["APPROVED", "REJECTED", "EXPIRED", "CONSUMED"] as const).map(
    (status, index) => ({
      ...base,
      exceptionId: `dddddddd-dddd-4ddd-8ddd-ddddddddddd${index}`,
      status,
      revision: 2,
      canReview: false,
      reviewedAt: base.requestedAt,
      terminalAt:
        status === "EXPIRED" || status === "CONSUMED" ? base.requestedAt : null,
    }),
  );
  await f.open(page);
  const section = page.getByTestId("presence-exceptions");
  await section.getByRole("button", { name: "History", exact: true }).click();
  for (const status of ["Approved", "Rejected", "Expired", "Consumed"])
    await expect(section).toContainText(status);
  expect(f.writes).toHaveLength(0);
  expect(
    await section.getByRole("button", { name: "Approve", exact: true }).count(),
  ).toBe(0);
});

test("Approve/Reject conflict displays canonical winner without a second decision", async ({
  page,
}) => {
  const f = new PresenceFixture("LM", (path, request, state) => {
    if (path.endsWith("/approve") && request.method() === "POST") {
      state.exceptions[0] = {
        ...state.exceptions[0]!,
        status: "REJECTED",
        revision: 2,
        reviewedAt: new Date().toISOString(),
        canReview: false,
      };
      return {
        status: 409,
        body: {
          code: "PRESENCE_REVISION_CONFLICT",
          message: "changed",
          requestId: "fixture",
        },
      };
    }
    return undefined;
  });
  await f.open(page);
  await page
    .getByTestId("presence-exceptions")
    .getByRole("button", { name: "Review", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(dialog).toContainText("Status: Rejected");
  await expect(
    dialog.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Reject", exact: true }),
  ).toHaveCount(0);
  expect(f.writes).toHaveLength(1);
});

test("zone CAS compares saved/current/draft and preserves the intended center", async ({
  page,
}) => {
  let conflict = true;
  const f = new PresenceFixture("LM", (path, request, state) => {
    if (
      path.endsWith(`/zones/${ZONE_ID}`) &&
      request.method() === "PUT" &&
      conflict
    ) {
      conflict = false;
      state.zones[0] = { ...state.zones[0]!, revision: 2, radiusMeters: 40 };
      return {
        status: 409,
        body: {
          code: "PRESENCE_REVISION_CONFLICT",
          message: "changed",
          requestId: "fixture",
        },
      };
    }
    return undefined;
  });
  await f.open(page);
  await page
    .getByTestId("presence-zones")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Latitude", { exact: true }).fill("32");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toContainText("Previous saved value");
  await expect(dialog).toContainText("Current server value");
  await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue(
    "32",
  );
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Review current state and reapply draft" })
    .click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(f.writes[1]!.body).toMatchObject({
    expectedRevision: 2,
    latitude: 32,
    radiusMeters: 25.5,
  });
});
