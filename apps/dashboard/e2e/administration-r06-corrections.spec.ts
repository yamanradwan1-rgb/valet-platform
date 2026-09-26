import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterLocations,
  lifecyclePath,
  locationLifecycle,
  locationsPath,
  selectLocation,
} from "./support/r06-locations";

for (const command of [
  "activate",
  "currency-correction",
  "timezone-correction",
] as const) {
  for (const failure of [
    "MFA_STEP_UP_REQUIRED",
    "LOCATION_LIFECYCLE_CONFLICT",
  ] as const) {
    test(`${command} ${failure} requires fresh explicit intent`, async ({
      page,
    }) => {
      let current = locationLifecycle();
      const bodies: Record<string, unknown>[] = [];
      const fixture = new DashboardApiFixture({
        companyOrganizations: [ORG_A],
        companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
        mfaState: "STEP_UP_REQUIRED",
        override: (path, request) => {
          if (path === lifecyclePath) return { body: current };
          if (path !== `${locationsPath}/${LOCATION_A.locationId}/${command}`)
            return undefined;
          bodies.push(request.postDataJSON());
          if (bodies.length === 1) {
            if (failure === "LOCATION_LIFECYCLE_CONFLICT")
              current = locationLifecycle({
                currency: "USD",
                timezone: "Europe/London",
                updatedAt: "2026-09-26T10:00:00.000Z",
              });
            return {
              status: failure === "LOCATION_LIFECYCLE_CONFLICT" ? 409 : 403,
              body: { code: failure, message: failure, requestId: "r06-write" },
            };
          }
          return {
            body:
              command === "timezone-correction"
                ? {
                    location: current,
                    impact: {
                      previousTimezone: current.timezone,
                      newTimezone: "Asia/Dubai",
                      historicalTimestampsRewritten: false,
                      historicalReportFactsRewritten: false,
                    },
                  }
                : current,
          };
        },
      });
      await fixture.install(page);
      await enterLocations(page);
      await selectLocation(page);
      const currency = page.getByLabel("Correct currency", { exact: true });
      const timezone = page.getByLabel("Correct timezone", { exact: true });
      const prepare = async () => {
        if (command === "currency-correction") await currency.fill("eur");
        if (command === "timezone-correction") {
          await timezone.fill("Asia/Dubai");
          await page
            .getByLabel("Reason", { exact: true })
            .fill("Correct mistaken timezone");
        }
      };
      const button =
        command === "activate"
          ? page.getByRole("button", { name: "Activate", exact: true })
          : (command === "currency-correction"
              ? currency.locator("../..")
              : timezone.locator("..")
            ).getByRole("button", { name: "Save", exact: true });
      await prepare();
      await button.click();
      if (failure === "MFA_STEP_UP_REQUIRED") {
        const dialog = page.getByRole("dialog", {
          name: "Verification required",
        });
        await dialog.getByLabel(/authenticator code/).fill("123456");
        await dialog
          .getByRole("button", { name: "Verify", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByTestId("location-detail").getByRole("alert"),
        ).toContainText("Verification succeeded");
      } else {
        await expect(currency).toHaveValue("USD");
        await expect(timezone).toHaveValue("Europe/London");
        await expect(
          page.getByTestId("location-detail").getByRole("alert"),
        ).toContainText("LOCATION_LIFECYCLE_CONFLICT");
        await expect(page.getByLabel("Reason", { exact: true })).toHaveValue(
          "",
        );
      }
      expect(bodies).toHaveLength(1);
      expect(bodies[0]?.expectedUpdatedAt).toBe("2026-09-26T09:00:00.000Z");
      await prepare();
      await expect(button).toBeEnabled();
      await button.click();
      await expect.poll(() => bodies.length).toBe(2);
      expect(bodies[1]?.expectedUpdatedAt).toBe(current.updatedAt);
      if (command === "currency-correction")
        expect(bodies[1]?.newCurrency).toBe("EUR");
      if (command === "timezone-correction")
        expect(bodies[1]).toMatchObject({
          newTimezone: "Asia/Dubai",
          reason: "Correct mistaken timezone",
        });
    });
  }
}

test("correction validation stays bounded and server errors remain visible", async ({
  page,
}) => {
  let posts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === lifecyclePath) return { body: locationLifecycle() };
      if (!path.endsWith("/currency-correction") || request.method() !== "POST")
        return undefined;
      posts++;
      return {
        status: 400,
        body: {
          code: "CONFIGURATION_VALUE_INVALID",
          message: "The Location lifecycle operation could not be applied.",
          requestId: "r06-invalid",
        },
      };
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  await selectLocation(page);
  const currency = page.getByLabel("Correct currency", { exact: true });
  const saveCurrency = currency
    .locator("../..")
    .getByRole("button", { name: "Save" });
  await currency.fill("12");
  await expect(saveCurrency).toBeDisabled();
  await currency.fill("zzz");
  await expect(currency).toHaveValue("ZZZ");
  await saveCurrency.click();
  await expect(
    page.getByTestId("location-detail").getByRole("alert"),
  ).toHaveText("The Location lifecycle operation could not be applied.");
  const timezone = page.getByLabel("Correct timezone", { exact: true });
  await timezone.fill("Asia/Dubai");
  const reason = page.getByLabel("Reason", { exact: true });
  await reason.fill("   ");
  await expect(
    timezone.locator("..").getByRole("button", { name: "Save" }),
  ).toBeDisabled();
  await expect(reason).toHaveAttribute("maxlength", "500");
  expect(posts).toBe(1);
});
