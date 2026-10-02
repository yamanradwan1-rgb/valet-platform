import { expect, type Page, type Request } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
  type FixtureReply,
} from "./dashboard-api-fixture";
import { historyPath, historyRow } from "./issue240e-history";
import { signInOnCurrentPage } from "./foundation-ui";

export const SHIFT_X = "60000000-0000-4000-8000-000000000001";
export const SHIFT_Y = "60000000-0000-4000-8000-000000000002";
export const FORCE_BASE = historyPath();
export const forcePath = (shiftId = SHIFT_X) =>
  `${FORCE_BASE}/${shiftId}/force-end`;
export const syntheticReason = "T05-G سبب التسليم 🅰️";
export const errorReply = (code: string, status = 409): FixtureReply => ({
  status,
  body: { code, message: "Synthetic server detail", requestId: "240g" },
});
export function forceResult(
  request: Record<string, unknown>,
  shiftId = SHIFT_X,
) {
  const row = historyRow({ shiftId });
  return {
    operationId: request.operationId,
    shiftId,
    membershipId: row.membershipId,
    locationId: row.location.locationId,
    status: "ENDED",
    startedAt: row.startedAt,
    endedAt: "2026-10-02T08:00:00.000Z",
    closureKind: "ADMIN_FORCE_END",
    cashReconciliationState: "PENDING",
  };
}
export function forceFixture(
  options: {
    manager?: boolean;
    extraScope?: boolean;
    onPost?: (
      request: Record<string, unknown>,
      raw: Request,
    ) => Promise<FixtureReply | "abort"> | FixtureReply | "abort";
    onRead?: (
      path: string,
      request: Request,
    ) => Promise<FixtureReply | undefined> | FixtureReply | undefined;
    rows?: ReturnType<typeof historyRow>[];
  } = {},
) {
  const state = { ended: false };
  const posts: Record<string, unknown>[] = [];
  const fixture = new DashboardApiFixture({
    ...(options.manager
      ? {
          locationManagerOrganizations: [ORG_A],
          locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
        }
      : {
          companyOrganizations: options.extraScope ? [ORG_A, ORG_B] : [ORG_A],
          companyLocations: {
            [ORG_A.organizationId]: options.extraScope
              ? [LOCATION_A, LOCATION_B]
              : [LOCATION_A],
            [ORG_B.organizationId]: [LOCATION_B],
          },
        }),
    override: async (path, request) => {
      const custom = await options.onRead?.(path, request);
      if (custom) return custom;
      if (path.endsWith("/staff"))
        return { body: { items: [], nextCursor: null } };
      if (path === historyPath(ORG_B.organizationId))
        return {
          body: {
            items: [historyRow({ location: LOCATION_B })],
            nextCursor: null,
          },
        };
      const rows = options.rows ?? [
        historyRow({
          status: state.ended ? "ENDED" : "ACTIVE",
          endedAt: state.ended ? "2026-10-02T08:00:00.000Z" : null,
        }),
      ];
      if (path === FORCE_BASE) {
        const status = new URL(request.url()).searchParams.get("status");
        return {
          body: {
            items: status ? rows.filter((row) => row.status === status) : rows,
            nextCursor: null,
          },
        };
      }
      const row = rows.find(
        (value) => path === `${FORCE_BASE}/${value.shiftId}`,
      );
      return row ? { body: row } : undefined;
    },
  });
  async function install(page: Page) {
    await fixture.install(page);
    await page.route("**/shifts/*/force-end", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      posts.push(body);
      const reply = options.onPost
        ? await options.onPost(body, route.request())
        : { body: forceResult(body) };
      if (reply === "abort") {
        await route.abort("failed");
        return;
      }
      if (!options.onPost) state.ended = true;
      await route.fulfill({
        status: reply.status ?? 200,
        contentType: "application/json",
        body: JSON.stringify(reply.body),
      });
    });
  }
  return { fixture, state, posts, install };
}
export async function enterForceHistory(page: Page, manager = false) {
  await page.goto("/employees");
  await signInOnCurrentPage(page, manager ? "manager@example.com" : undefined);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  if (!manager)
    await page.getByRole("button", { name: "Shifts", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("maya@example.com");
}
export async function openForceEnd(page: Page, index = 0) {
  await page.getByRole("table").getByRole("button").nth(index).click();
  const drawer = page.getByRole("dialog", {
    name: "Shift details",
    exact: true,
  });
  await expect(drawer).toContainText("maya@example.com");
  await drawer
    .getByRole("button", { name: "Force End Shift", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Force End Shift",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function fillForceEnd(page: Page, reason = syntheticReason) {
  const dialog = page.getByRole("dialog", {
    name: "Force End Shift",
    exact: true,
  });
  await dialog.getByLabel("Reason", { exact: true }).fill(reason);
  await dialog.getByRole("checkbox").check();
  return dialog;
}
