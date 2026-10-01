import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";
import { signInCompany } from "./support/staff-directory-ui";
import { persistentMatches } from "./support/persistent-storage";

const directory = staffPath(ORG_A.organizationId);
test("T05-A debounce/clear, bounded Location picker, filtered pagination and memory-only identity", async ({
  page,
}) => {
  const seen: URLSearchParams[] = [];
  const writes: string[] = [];
  const locations = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
  const identity = {
    firstName: "NameSentinel",
    lastName: "O’Connor",
    email: "pii-sentinel@example.com",
  };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (request.method() !== "GET" && !path.includes("/auth/"))
        writes.push(path);
      const query = new URL(request.url()).searchParams;
      if (path === locations)
        return {
          body: {
            items: [query.has("cursor") ? LOCATION_B : LOCATION_A],
            nextCursor: query.has("cursor") ? null : "LOC_NEXT",
          },
        };
      if (path === directory) {
        seen.push(query);
        return {
          body: {
            items: [staffItem({ identity })],
            nextCursor: query.has("cursor") ? null : "STAFF_NEXT",
          },
        };
      }
      if (path.startsWith(directory + "/"))
        return { body: staffDetail({ identity }) };
      return undefined;
    },
  });
  await fixture.install(page);
  await signInCompany(page);
  await expect(
    page.getByText("NameSentinel O’Connor", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(identity.email, { exact: true })).toBeVisible();
  expect(seen).toHaveLength(1);
  const initialLocations = fixture.count(locations);
  const clockTime = new Date();
  await page.clock.install({ time: clockTime });
  await page.clock.pauseAt(new Date(clockTime.getTime() + 1000));
  const search = page.getByRole("searchbox");
  for (const value of ["Name", "NameS", "NameSentinel"]) {
    await search.fill(value);
    await page.clock.runFor(100);
  }
  expect(seen).toHaveLength(1);
  await page.clock.runFor(199);
  expect(seen).toHaveLength(1);
  await page.clock.runFor(1);
  await expect.poll(() => seen.length).toBe(2);
  expect(seen.at(-1)?.get("search")).toBe("NameSentinel");
  await page.clock.runFor(600);
  expect(seen).toHaveLength(2);
  await search.fill("");
  await expect.poll(() => seen.length).toBe(3);
  expect(seen.at(-1)?.has("search")).toBe(false);
  await page.clock.runFor(600);
  expect(seen).toHaveLength(3);
  await search.fill("NameSentinel");
  await page.clock.runFor(300);
  await expect.poll(() => seen.length).toBe(4);
  await page
    .getByRole("combobox", { name: "Role" })
    .selectOption("VALET_EMPLOYEE");
  await expect.poll(() => seen.length).toBe(5);
  await page.getByRole("combobox", { name: "Status" }).selectOption("ACTIVE");
  await expect.poll(() => seen.length).toBe(6);
  const location = page.getByRole("combobox", {
    name: "Location",
    exact: true,
  });
  expect(fixture.count(locations)).toBe(initialLocations);
  await location.focus();
  await expect(location.locator('option[value="NEXT"]')).toHaveCount(1);
  expect(fixture.count(locations)).toBe(initialLocations + 1);
  await page.clock.runFor(600);
  expect(fixture.count(locations)).toBe(initialLocations + 1);
  await location.selectOption("NEXT");
  await expect(
    location.locator(`option[value="${LOCATION_B.locationId}"]`),
  ).toHaveCount(1);
  expect(fixture.count(locations)).toBe(initialLocations + 2);
  expect(seen).toHaveLength(6);
  await location.selectOption(LOCATION_B.locationId);
  await expect.poll(() => seen.length).toBe(7);
  await page
    .getByRole("button", { name: "Details: NameSentinel O’Connor" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(fixture.count(`${directory}/${staffItem().membershipId}`)).toBe(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => seen.length).toBe(8);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect.poll(() => seen.length).toBe(9);
  for (const query of seen.slice(6)) {
    expect(Object.fromEntries(query)).toMatchObject({
      search: "NameSentinel",
      role: "VALET_EMPLOYEE",
      status: "ACTIVE",
      locationId: LOCATION_B.locationId,
      limit: "50",
    });
  }
  expect(seen[7]?.get("cursor")).toBe("STAFF_NEXT");
  expect(seen[8]?.has("cursor")).toBe(false);
  await page
    .getByRole("button", { name: "Details: NameSentinel O’Connor" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("combobox", { name: "Status" }).selectOption("INACTIVE");
  await expect.poll(() => seen.length).toBe(10);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  expect(seen.at(-1)?.has("cursor")).toBe(false);
  await page.clock.runFor(600);
  expect(seen).toHaveLength(10);
  expect(writes).toEqual([]);
  for (const sentinel of [
    identity.firstName,
    identity.lastName,
    identity.email,
    "NameSentinel",
  ]) {
    expect(await persistentMatches(page, sentinel)).toEqual({
      local: [],
      session: [],
      indexed: [],
      cache: [],
    });
  }
});
