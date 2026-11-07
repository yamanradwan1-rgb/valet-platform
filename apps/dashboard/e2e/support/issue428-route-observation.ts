import { expect, type Page, type Request } from "@playwright/test";

/** Observe every staff request before navigation, including non-presence APIs. */
export function captureStaffRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/v1/staff/"))
      requests.push(request);
  });
  return requests;
}

export function shiftStartEndPosts(requests: readonly Request[]): string[] {
  return requests
    .filter((request) => {
      const path = new URL(request.url()).pathname;
      return (
        request.method() === "POST" &&
        /\/shifts\/(?:start|[^/]+\/(?:end|force-end))\/?$/u.test(path)
      );
    })
    .map((request) => request.url());
}

export async function expectCompactEmployeeTabs(page: Page, width: number) {
  const employees = page.getByRole("button", { name: "Employees", exact: true });
  const tabs = employees.locator("..");
  const buttons = [
    employees,
    tabs.getByRole("button", { name: "Shifts", exact: true }),
    tabs.getByRole("button", { name: "Exceptions", exact: true }),
  ];
  await expect(tabs.getByRole("button")).toHaveCount(3);
  const rectangles = await Promise.all(buttons.map((button) => button.boundingBox()));
  for (const rectangle of rectangles) {
    expect(rectangle).not.toBeNull();
    expect(rectangle!.height).toBeGreaterThanOrEqual(30);
  }
  for (let index = 0; index < rectangles.length; index++) {
    for (let other = index + 1; other < rectangles.length; other++) {
      const a = rectangles[index]!;
      const b = rectangles[other]!;
      const overlapX = Math.max(
        0,
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
      );
      const overlapY = Math.max(
        0,
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
      );
      expect(overlapX * overlapY).toBeLessThan(1);
    }
  }
  for (const button of buttons) {
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(employees).toBeVisible();
}
