import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { incidentItem } from "./support/operations-fixtures";
import { enterR08, r08Path } from "./support/r08-accountability";
import {
  incidentResolutionRequestSchema,
  type IncidentOverviewEntry,
} from "@valet/contracts";

test("#337 resolves with confirmation, retains Critical severity and stays visible after refresh", async ({
  page,
}, info) => {
  let item: IncidentOverviewEntry = {
    ...incidentItem(),
    status: "OPEN",
    severity: "CRITICAL",
    reporterDisplayName: "Synthetic Reporter",
  };
  let posts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === `${r08Path("incidents")}/${item.incidentId}/resolve`) {
        const body = incidentResolutionRequestSchema.parse(
          request.postDataJSON(),
        );
        posts++;
        item = {
          ...item,
          status: "RESOLVED",
          resolvedAt: "2026-10-25T09:00:00.000Z",
          resolvedByDisplayName: "Synthetic Admin",
          resolutionNotes: body.resolutionNotes,
        };
        return { body: item };
      }
      if (path === r08Path("incidents")) {
        const active =
          new URL(request.url()).searchParams.get("filter") === "ACTIVE";
        return {
          body: {
            items: active && item.status === "RESOLVED" ? [] : [item],
            nextCursor: null,
          },
        };
      }
      return undefined;
    },
  });
  await enterR08(page, "/incidents", fixture);
  const open = page.locator("tbody tr").first().getByRole("button");
  await open.click();
  const drawer = page.getByRole("dialog");
  await page.screenshot({
    path: info.outputPath("incident-open.png"),
    fullPage: true,
  });
  await drawer
    .getByRole("button", { name: "Mark Resolved", exact: true })
    .click();
  await expect(drawer.getByLabel("Resolution note (required)")).toBeFocused();
  await expect(
    drawer.getByRole("button", { name: "Confirm resolution" }),
  ).toBeDisabled();
  await drawer
    .getByLabel("Resolution note (required)")
    .fill("Synthetic repair confirmed");
  await page.screenshot({
    path: info.outputPath("incident-expanded.png"),
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.accept());
  await drawer.getByRole("button", { name: "Confirm resolution" }).click();
  await expect(page.locator("tbody tr")).toContainText("Resolved");
  await expect(page.locator("tbody tr")).toContainText("Critical");
  await expect(drawer).toContainText("Synthetic Admin");
  await expect(drawer).toContainText("Synthetic repair confirmed");
  await expect(
    drawer.getByRole("button", { name: "Mark Resolved", exact: true }),
  ).toHaveCount(0);
  expect(posts).toBe(1);
  await page.screenshot({
    path: info.outputPath("incident-resolved.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await page.reload();
  await expect(page.locator("tbody tr")).toContainText("Resolved");
  await page.getByLabel("Incident status").selectOption("ACTIVE");
  await expect(page.getByText("No incidents in this view.")).toBeVisible();
  await page.getByLabel("Incident status").selectOption("RESOLVED");
  await expect(page.locator("tbody tr")).toContainText("Critical");
});

for (const width of [320, 390, 768]) {
  test(`#337 resolved long-note drawer remains reachable at ${width} and 200% CSS zoom`, async ({ page }) => {
    const note = "Synthetic".repeat(100);
    const fixture = new DashboardApiFixture({ companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] }, override: (path) =>
        path === r08Path("incidents") ? { body: { items: [{ ...incidentItem(), status: "RESOLVED",
          resolvedAt: "2026-10-25T09:00:00.000Z", resolvedByDisplayName: "Synthetic Admin", resolutionNotes: note }],
        nextCursor: null } } : undefined,
    });
    await enterR08(page, "/incidents", fixture);
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await page.locator("tbody tr").first().getByRole("button").click();
    const drawer = page.getByRole("dialog");
    await drawer.getByText(note, { exact: true }).scrollIntoViewIfNeeded();
    const geometry = await drawer.evaluate((element) => ({
      outer: [element.clientWidth, element.scrollWidth],
      overflow: [...element.querySelectorAll<HTMLElement>("*")].filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => ({ tag: node.tagName, className: node.className,
          width: node.clientWidth, scroll: node.scrollWidth, text: node.textContent?.slice(0, 24) })),
    }));
    expect(geometry.outer[1], JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.outer[0]! + 1);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });
}
