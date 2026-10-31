import { expect, test } from "@playwright/test";
import {
  openRouteTask,
  openRouteViewer,
  recordedSample,
  recordings,
  routeDiscovery,
  samplePath,
  routeTrackers,
} from "./support/issue343-route-fixture";

test("loads only on explicit open; recorded coordinates, slider, nested Escape and focus return", async ({
  page,
}) => {
  const fixture = await openRouteTask(page);
  expect(fixture.count(routeDiscovery)).toBe(0);
  expect(fixture.count(samplePath())).toBe(0);
  const viewer = await openRouteViewer(page);
  await expect(
    viewer.getByRole("slider", { name: "Inspect recorded samples" }),
  ).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "Close route viewer" }),
  ).toBeFocused();
  await expect(
    viewer.getByText("Coordinate map · basemap unavailable"),
  ).toBeVisible();
  await viewer
    .getByRole("button", { name: "Next sample", exact: true })
    .click();
  await expect(
    viewer.getByText("Sample 2 of 2", { exact: true }),
  ).toBeVisible();
  await viewer
    .getByRole("slider", { name: "Inspect recorded samples" })
    .press("Home");
  await expect(
    viewer.getByText("Sample 1 of 2", { exact: true }),
  ).toBeVisible();
  await viewer.getByRole("button", { name: "Zoom in", exact: true }).click();
  await viewer
    .getByRole("button", { name: "Fit recording", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Route", exact: true }),
  ).toBeFocused();
  const reads = fixture.count(samplePath());
  await page.waitForTimeout(150);
  expect(fixture.count(samplePath())).toBe(reads);
});

test("active Task never discovers an older ended segment", async ({ page }) => {
  const fixture = await openRouteTask(page, { status: "IN_PROGRESS" });
  await expect(
    page.getByRole("button", { name: "View Route", exact: true }),
  ).toBeDisabled();
  expect(fixture.count(routeDiscovery)).toBe(0);
  expect(fixture.count(samplePath())).toBe(0);
});

test("completed Retrieval, separate recordings and unknown immutable provenance", async ({
  page,
}) => {
  await openRouteTask(page, {
    type: "RETRIEVAL",
    override: (path) => {
      if (path === routeDiscovery) return { body: recordings(2) };
      if (path === samplePath(routeTrackers[1]))
        return { body: { samples: [recordedSample(100)], nextCursor: null } };
      return undefined;
    },
  });
  const viewer = await openRouteViewer(page);
  await expect(
    viewer.getByRole("slider", { name: "Inspect recorded samples" }),
  ).toBeVisible();
  await viewer.getByLabel("Recording", { exact: true }).selectOption("1");
  await expect(
    viewer.getByText("Historical owner unknown", { exact: true }),
  ).toBeVisible();
  await expect(
    viewer.getByText("Sample 1 of 1", { exact: true }),
  ).toBeVisible();
  await expect(viewer.locator("[data-route-segment]")).toHaveCount(1);
  await expect(
    viewer
      .getByText("One observation only. No traveled path can be shown.")
      .first(),
  ).toBeVisible();
  await expect(
    viewer.getByText("55555555-5555-4555-8555-555555555556"),
  ).toHaveCount(0);
});

test("2,000-point window is bounded, explicit pagination reaches remaining samples", async ({
  page,
}) => {
  const fixture = await openRouteTask(page, {
    override: (path, url) => {
      if (path !== samplePath()) return undefined;
      const start = Number(url.searchParams.get("cursor") ?? 0);
      const count = start === 2000 ? 1 : 500;
      return {
        body: {
          samples: Array.from({ length: count }, (_, i) =>
            recordedSample(start + i),
          ),
          nextCursor: start === 2000 ? null : String(start + count),
        },
      };
    },
  });
  const viewer = await openRouteViewer(page);
  await expect(
    viewer.getByText("Sample 1 of 2,000", { exact: true }),
  ).toBeVisible();
  expect(fixture.count(samplePath())).toBeLessThanOrEqual(5);
  expect(await viewer.locator('[role="button"]').count()).toBeLessThanOrEqual(
    31,
  );
  await expect(
    viewer.getByText("Partial history · showing a bounded sample window"),
  ).toBeVisible();
  await viewer
    .getByRole("button", { name: "Next observations", exact: true })
    .click();
  await expect(
    viewer.getByText("Sample 1 of 1", { exact: true }),
  ).toBeVisible();
  expect(fixture.count(samplePath())).toBeLessThanOrEqual(7);
  await viewer
    .getByRole("button", { name: "Previous observations", exact: true })
    .click();
  await expect(
    viewer.getByText("Sample 1 of 2,000", { exact: true }),
  ).toBeVisible();
});

test("failed second page discards coordinates; explicit retry reauthorizes from first page", async ({
  page,
}) => {
  let failed = false;
  await openRouteTask(page, {
    override: (path, url) => {
      if (path !== samplePath()) return undefined;
      if (!url.searchParams.get("cursor"))
        return { body: { samples: [recordedSample(0)], nextCursor: "second" } };
      if (!failed) {
        failed = true;
        return {
          status: 503,
          body: {
            code: "UNAVAILABLE",
            message: "Unavailable",
            requestId: "fixture",
          },
        };
      }
      return { body: { samples: [recordedSample(1)], nextCursor: null } };
    },
  });
  const viewer = await openRouteViewer(page);
  await expect(
    viewer.getByText("Route could not be loaded", { exact: true }),
  ).toBeVisible();
  await expect(
    viewer.getByRole("slider", { name: "Inspect recorded samples" }),
  ).toHaveCount(0);
  await viewer.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    viewer.getByText("Sample 1 of 2", { exact: true }),
  ).toBeVisible();
});

for (const deniedAt of ["discovery", "sample"] as const)
  test(`denied ${deniedAt} removes protected data`, async ({ page }) => {
    await openRouteTask(page, {
      override: (path) => {
        if (path === (deniedAt === "discovery" ? routeDiscovery : samplePath()))
          return {
            status: 404,
            body: {
              code: "AUTHORIZATION_DENIED",
              message: "Unavailable",
              requestId: "fixture",
            },
          };
        return undefined;
      },
    });
    const viewer = await openRouteViewer(page);
    await expect(
      viewer.getByRole("heading", { name: "Route access unavailable" }),
    ).toBeVisible();
    await expect(
      viewer.getByRole("slider", { name: "Inspect recorded samples" }),
    ).toHaveCount(0);
    await expect(
      viewer.getByText("55555555-5555-4555-8555-555555555556"),
    ).toHaveCount(0);
  });

for (const state of ["empty", "unavailable"] as const)
  test(`truthful ${state} state`, async ({ page }) => {
    await openRouteTask(page, {
      override: (path) => {
        if (state === "unavailable" && path === routeDiscovery)
          return { body: { recordings: [], nextCursor: null } };
        if (state === "empty" && path === samplePath())
          return { body: { samples: [], nextCursor: null } };
        return undefined;
      },
    });
    const viewer = await openRouteViewer(page);
    await expect(
      viewer.getByRole("heading", {
        name:
          state === "empty" ? "No recorded GPS points" : "Route unavailable",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      viewer.getByRole("slider", { name: "Inspect recorded samples" }),
    ).toHaveCount(0);
  });

test("closing a slow read cancels it; reopened viewer rejects the stale result", async ({
  page,
}) => {
  let requests = 0;
  await openRouteTask(page, {
    override: (path) => {
      if (path !== samplePath()) return undefined;
      requests++;
      return {
        delayMs: requests <= 2 ? 700 : 0,
        body: {
          samples: [
            { ...recordedSample(0), latitude: requests <= 2 ? 11 : 22 },
          ],
          nextCursor: null,
        },
      };
    },
  });
  let viewer = await openRouteViewer(page);
  await expect.poll(() => requests).toBeGreaterThanOrEqual(1);
  await page.keyboard.press("Escape");
  viewer = await openRouteViewer(page);
  await expect(viewer.getByText(/22\.000000° N/)).toBeVisible();
  await page.waitForTimeout(800);
  await expect(viewer.getByText(/11\.000000/)).toHaveCount(0);
  await expect(viewer.getByText(/22\.000000° N/)).toBeVisible();
});
