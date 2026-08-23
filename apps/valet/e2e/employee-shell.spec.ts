import { expect, test } from "@playwright/test";

/**
 * VUI-008 browser E2E gate: proves the real Next Employee live UI renders
 * the truthful access/loading gate and that prototype demo data never
 * appears in production mode. Staff API is NOT mocked — the real Next.js
 * server proxies to the real API application.
 */
test.describe("Employee live shell truthfulness", () => {
  test("production mode shows loading or sign-in gate without prototype data", async ({
    page,
  }) => {
    await page.goto("/");
    // Wait for either the initializing spinner or the sign-in form.
    await expect(
      page
        .getByTestId("access-gate")
        .or(page.getByText("Checking staff session"))
        .or(page.getByText("Staff sign in")),
    ).toBeVisible({ timeout: 15_000 });
    const body = await page.textContent("body");
    // Prototype-only fixtures must never appear.
    expect(body).not.toContain("Mohammed Khalil");
    expect(body).not.toContain("Four Seasons Amman");
    expect(body).not.toContain("Main Entrance");
    expect(body).not.toContain("Start Shift");
    expect(body).not.toContain("BMW X5 · 12-34567");
    expect(body).not.toContain("4821");
    expect(body).not.toContain("INC-1042");
  });

  test("manifest is served with install metadata", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const manifest = (await res.json()) as {
      display: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.status()).toBe(200);
    }
  });
});

test.describe("Employee connectivity hint", () => {
  test("shows no fabricated sync claims in offline banner", async ({ page }) => {
    await page.goto("/");
    const body = await page.textContent("body");
    // DEC-058 §7 prohibits queue/sync/success claims.
    expect(body).not.toContain("will sync");
    expect(body).not.toContain("automatically sync");
    expect(body).not.toContain("actions were queued");
  });
});
