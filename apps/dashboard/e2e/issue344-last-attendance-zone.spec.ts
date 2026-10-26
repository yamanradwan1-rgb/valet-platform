import { expect, test } from "@playwright/test";
import { PresenceFixture, ZONE_ID } from "./support/presence-fixtures";
import { mockPresenceMap } from "./support/presence-map-mock";

for (const strict of [
  "start",
  "end",
  "additional",
  "none",
  "missing",
  "changing",
] as const) {
  test(`#344 ${strict}: rejected disable remains open and active with truthful feedback`, async ({
    page,
  }) => {
    await mockPresenceMap(page);
    const f: PresenceFixture = new PresenceFixture("LM", (path, request) => {
      if (path.endsWith(`/zones/${ZONE_ID}`) && request.method() === "PUT") {
        return {
          status: 409,
          body: {
            code: "PRESENCE_NOT_READY",
            message: "Rejected",
            requestId: "synthetic-344",
          },
        };
      }
      if (f.writes.length && strict === "missing" && path.endsWith("/policy"))
        return {
          status: 503,
          body: {
            code: "UNAVAILABLE",
            message: "Unavailable",
            requestId: "synthetic-344",
          },
        };
      if (
        strict === "changing" &&
        f.writes.length &&
        path.endsWith(`/zones/${ZONE_ID}`)
      )
        return {
          body: {
            zone: { ...f.zones[0], revision: 2 },
            readiness: f.policy.readiness,
          },
        };
      return undefined;
    });
    if (strict !== "none") {
      const action = strict === "end" ? "end" : "start";
      f.policy.overrides[`${action}ModeOverride`] = "REQUIRE_OR_OVERRIDE";
      f.policy.effective[`${action}Mode`] = "REQUIRE_OR_OVERRIDE";
      f.policy.readiness.applicability = "STRICT";
    }
    if (strict === "additional") f.policy.readiness.activeZoneCount = 2;
    await f.open(page);
    await page
      .getByTestId("presence-zones")
      .getByRole("button", { name: "Disable", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Edit Attendance Zone" });
    await dialog.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(dialog.getByRole("alert").first()).toContainText(
      ["start", "end"].includes(strict)
        ? "last active attendance zone"
        : "Review Readiness",
    );
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText("Saved. Current server state");
    expect(f.zones[0]?.state).toBe("ACTIVE");
    expect(f.writes).toHaveLength(1);
  });
}
