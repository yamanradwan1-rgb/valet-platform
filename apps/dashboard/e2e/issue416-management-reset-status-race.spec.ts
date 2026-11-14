import { expect, test, type Page, type Request } from "@playwright/test";
import { staffDirectoryItem } from "./support/administration-fixtures";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  type FixtureReply,
} from "./support/dashboard-api-fixture";
import { openEmployees, STAFF_BASE } from "./support/issue240d-onboarding";

test.use({ trace: "off" });
const employee = staffDirectoryItem();
const detailPath = `${STAFF_BASE}/${employee.membershipId}`;
const statusPath = `${detailPath}/password-resets/status`;
const issuePath = `${detailPath}/password-resets`;
const resetLink = `https://staff.example/staff/reset-password#reset=vspr1.${"A".repeat(43)}`;
const detail = {
  ...employee,
  locationAccess: {
    items: [
      {
        locationId: LOCATION_A.locationId,
        name: LOCATION_A.name,
        status: "ACTIVE",
      },
    ],
    totalCount: 1,
    truncated: false,
  },
  pendingInvitation: null,
};
const eligible = (generation: number, allowed = true) => ({
  eligible: allowed,
  latestGeneration: generation,
  linkState: generation ? "ACTIVE" : "NONE",
  expiresAt: null,
});
const failed = (requestId: string) => ({
  status: 503,
  body: {
    code: "STAFF_PASSWORD_RESET_UNAVAILABLE",
    message: "Synthetic status unavailable",
    requestId,
  },
});
function fixtureFor(
  override: (path: string, request: Request) => FixtureReply | undefined,
) {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === STAFF_BASE)
        return { body: { items: [employee], nextCursor: null } };
      if (path === detailPath) return { body: detail };
      return override(path, request);
    },
  });
}
async function openReset(page: Page, fixture: DashboardApiFixture) {
  await openEmployees(page, fixture);
  await page.getByRole("table").getByRole("button").first().click();
  const trigger = page.getByRole("button", { name: "Reset password" });
  await trigger.click();
  return {
    trigger,
    modal: page.getByRole("dialog", { name: "Reset employee password" }),
  };
}

test("normal GET started before direct reconciliation cannot replay an older generation", async ({
  page,
}) => {
  let reads = 0;
  const commands: Array<{ operationId: string; expectedGeneration: number }> =
    [];
  const fixture = fixtureFor((path, request) => {
    if (path === statusPath) {
      reads++;
      return {
        delayMs: reads === 4 ? 800 : 0,
        body: eligible(reads === 5 ? 1 : 0),
      };
    }
    if (path === issuePath) {
      commands.push(request.postDataJSON());
      return commands.length === 1
        ? {
            status: 500,
            body: {
              code: "HTTP_ERROR",
              message: "Commit unknown",
              requestId: "issue-1",
            },
          }
        : {
            status: 201,
            body: {
              outcome: "LINK_ISSUED",
              membershipId: employee.membershipId,
              generation: 2,
              expiresAt: "2026-11-14T10:00:00.000Z",
              resetLink,
            },
          };
    }
    return undefined;
  });
  const { trigger, modal } = await openReset(page, fixture);
  await modal
    .getByRole("button", { name: "Generate a password reset link" })
    .click();
  await expect(
    modal.getByRole("button", { name: "Retry original operation" }),
  ).toBeEnabled();
  expect(commands).toHaveLength(1);
  await modal.getByRole("button", { name: "Close" }).click();
  await trigger.click();
  await expect.poll(() => fixture.count(statusPath)).toBe(4);
  await modal.getByRole("button", { name: "Refresh status" }).click();
  const replacement = modal.getByRole("button", {
    name: "Generate a replacement link",
  });
  await expect(replacement).toBeEnabled();
  await page.waitForTimeout(850); // delayed normal GET #4 would now have returned
  await expect(replacement).toBeEnabled();
  expect(commands).toHaveLength(1); // absolutely no automatic replay
  await replacement.click();
  await expect(modal.getByRole("button", { name: "Copy link" })).toBeVisible();
  expect(commands[1]!.expectedGeneration).toBe(1);
  expect(commands[1]!.operationId).not.toBe(commands[0]!.operationId);
});

test("older direct GET cannot undo newer direct GET 503 for identical operation", async ({
  page,
}) => {
  let reads = 0;
  const commands: unknown[] = [];
  const fixture = fixtureFor((path, request) => {
    if (path === statusPath) {
      reads++;
      return reads === 3 || reads === 5
        ? failed(`status-${reads}`)
        : { delayMs: reads === 4 ? 750 : 0, body: eligible(0) };
    }
    if (path === issuePath) {
      commands.push(request.postDataJSON());
      return {
        status: 500,
        body: {
          code: "HTTP_ERROR",
          message: "Unknown COMMIT",
          requestId: "issue-1",
        },
      };
    }
    return undefined;
  });
  const { modal } = await openReset(page, fixture);
  await modal
    .getByRole("button", { name: "Generate a password reset link" })
    .click();
  await expect(
    modal.getByText(/Current status could not be verified/),
  ).toBeVisible();
  const refresh = modal.getByRole("button", { name: "Refresh status" });
  await refresh.click();
  await expect.poll(() => fixture.count(statusPath)).toBe(4);
  await refresh.click();
  await expect.poll(() => fixture.count(statusPath)).toBe(5);
  await expect(
    modal.getByText(/Current status could not be verified/),
  ).toBeVisible();
  await page.waitForTimeout(800); // stale success #4 cannot restore eligibility
  await expect(
    modal.getByRole("button", { name: "Generate a replacement link" }),
  ).toBeDisabled();
  expect(commands).toHaveLength(1);
});

for (const newerReply of ["ineligible", "503"] as const) {
  test(`fresh normal GET after successful reconciliation: ${newerReply} revokes issue authority`, async ({
    page,
  }) => {
    let reads = 0;
    const commands: Array<{ operationId: string; expectedGeneration: number }> =
      [];
    const fixture = fixtureFor((path, request) => {
      if (path === statusPath) {
        reads++;
        if (reads === 4)
          return newerReply === "503"
            ? { ...failed("newer-503"), delayMs: 280 }
            : { delayMs: 280, body: eligible(1, false) };
        return { body: eligible(reads <= 2 ? 0 : 1) };
      }
      if (path === issuePath) {
        commands.push(request.postDataJSON());
        return commands.length === 1
          ? {
              status: 500,
              body: {
                code: "HTTP_ERROR",
                message: "After COMMIT",
                requestId: "issue-1",
              },
            }
          : {
              status: 201,
              body: {
                outcome: "LINK_ISSUED",
                membershipId: employee.membershipId,
                generation: 2,
                expiresAt: "2026-11-14T10:00:00.000Z",
                resetLink,
              },
            };
      }
      return undefined;
    });
    const { trigger, modal } = await openReset(page, fixture);
    await modal
      .getByRole("button", { name: "Generate a password reset link" })
      .click();
    const replacement = modal.getByRole("button", {
      name: "Generate a replacement link",
    });
    await expect(replacement).toBeEnabled(); // direct GET #3 established generation 1
    await modal.getByRole("button", { name: "Close" }).click();
    await trigger.click(); // a later normal GET #4 MUST supersede direct GET #3
    await expect.poll(() => fixture.count(statusPath)).toBe(4);
    await expect(replacement).toBeDisabled(); // pending GET cannot use stale authority
    await expect(
      modal.getByText(/Current status could not be verified/),
    ).toBeVisible();
    await expect(replacement).toBeDisabled(); // newer eligible=false or 503 revokes
    expect(commands).toHaveLength(1); // no automatic POST
    await modal.getByRole("button", { name: "Refresh status" }).click();
    await expect.poll(() => fixture.count(statusPath)).toBe(5);
    await expect(replacement).toBeEnabled(); // only new verified GET can restore
    expect(commands).toHaveLength(1);
    await replacement.click();
    await expect(
      modal.getByRole("button", { name: "Copy link" }),
    ).toBeVisible();
    expect(commands[1]!.expectedGeneration).toBe(1);
    expect(commands[1]!.operationId).not.toBe(commands[0]!.operationId);
  });
}
