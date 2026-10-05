import { expect, type Page } from "@playwright/test";
import {
  PresenceFixture,
  attendanceZone,
  caBase,
  fillZone,
} from "./presence-fixtures";
import { authPayload } from "./fixture-data";

export type ReceiptOutcome = "COMMITTED" | "UNKNOWN" | "FAIL";
export function continuityFixture() {
  let mutationId = "";
  let zoneId = "";
  let outcome: ReceiptOutcome = "UNKNOWN";
  let refreshed = false;
  let replaceSession = false;
  let holdResult: (() => Promise<void>) | null = null;
  const f = new PresenceFixture("CA", async (path, request, state) => {
    if (path === "/v1/staff/auth/refresh") {
      if (!state.fixture.auth.hasCookie(request)) return undefined;
      refreshed = true;
      return {
        body: {
          ...authPayload(
            "B",
            replaceSession
              ? "99999999-9999-4999-8999-999999999999"
              : state.fixture.auth.staffAuthSessionId,
          ),
          accessExpiresAt: "2101-01-01T00:00:00.000Z",
        },
      };
    }
    if (path === `${caBase}/zones` && request.method() === "POST") {
      ({ mutationId, zoneId } = request.postDataJSON());
      return {
        status: 503,
        body: {
          code: "SERVER_ERROR",
          message: "private",
          requestId: "fixture",
        },
      };
    }
    if (!path.includes("/results/")) return undefined;
    expect(path).toBe(`${caBase}/results/${mutationId}`);
    const query = new URL(request.url()).searchParams;
    expect(query.get("kind")).toBe("ZONE");
    expect(query.get("entityId")).toBe(zoneId);
    if (refreshed)
      expect(request.headers().authorization).toBe(
        `Bearer vsa1.${"B".repeat(43)}`,
      );
    if (holdResult) await holdResult();
    if (outcome === "FAIL")
      return {
        status: 503,
        body: {
          code: "SERVER_ERROR",
          message: "private",
          requestId: "fixture",
        },
      };
    const committed = outcome === "COMMITTED";
    return {
      body: {
        mutationId,
        attribution: outcome,
        effect: committed ? "CHANGED" : null,
        entityId: committed ? zoneId : null,
        revision: committed ? 1 : null,
        canonical: {
          kind: "ZONE",
          value: {
            zone: committed
              ? { ...attendanceZone(), id: zoneId, label: "Old exact receipt" }
              : null,
            readiness: state.policy.readiness,
          },
        },
      },
    };
  });
  f.exceptions = f.exceptions.map((value) => ({
    ...value,
    expiresAt: "2200-01-01T00:00:00.000Z",
  }));
  return {
    f,
    setOutcome: (value: ReceiptOutcome) => {
      outcome = value;
    },
    replace: () => {
      replaceSession = true;
    },
    hold: (value: () => Promise<void>) => {
      holdResult = value;
    },
  };
}

export async function createUnknown(page: Page, f: PresenceFixture) {
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toContainText("outcome of your request is unknown");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
}
export async function expectBlocked(page: Page) {
  await expect(page.getByTestId("shift-presence")).toContainText(
    "outcome of your request is unknown",
  );
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator("#presence-shiftPresenceMaxAccuracyMeters"),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review", exact: true }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry reconciliation", exact: true }),
  ).toBeEnabled();
}
