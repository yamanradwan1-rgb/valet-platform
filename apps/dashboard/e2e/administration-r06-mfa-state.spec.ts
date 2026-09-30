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
} from "./support/r06-locations";

for (const deniedAgain of [false, true]) {
  test(`lifecycle MFA stays coherent after verification; repeated denial=${deniedAgain}`, async ({
    page,
  }) => {
    let releaseRead!: () => void;
    const pendingRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let posts = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      mfaState: "STEP_UP_REQUIRED",
      override: async (path, request, state) => {
        if (path.includes("/locations") && request.method() === "POST") posts++;
        if (path !== lifecyclePath) return undefined;
        if (state.mfaAssured) await pendingRead;
        if (!state.mfaAssured || deniedAgain)
          return {
            status: 403,
            body: {
              code: "MFA_STEP_UP_REQUIRED",
              message: "Verification required",
              requestId: "r06-mfa",
            },
          };
        return { body: locationLifecycle() };
      },
    });
    await fixture.install(page);
    await enterLocations(page, true);
    const challenge = page.getByRole("dialog", {
      name: "Verification required",
    });
    await expect(challenge).toBeVisible();
    await expect(page.getByText(/Verification succeeded/)).toHaveCount(0);
    const readsBefore = fixture.count(lifecyclePath);
    await challenge.getByLabel(/authenticator code/i).fill("123456");
    await challenge
      .getByRole("button", { name: "Verify", exact: true })
      .click();
    await expect.poll(() => fixture.count(lifecyclePath)).toBe(readsBefore + 1);
    await expect(challenge).toHaveCount(0);
    await expect(page.getByText(/Verification succeeded/)).toHaveCount(0);
    releaseRead();
    if (deniedAgain) {
      await expect(challenge).toHaveCount(1);
      await expect(
        challenge.getByLabel("6-digit authenticator code"),
      ).toBeVisible();
      await expect(
        challenge.getByRole("button", { name: "Retry" }),
      ).toHaveCount(0);
      await expect(page.getByText(/Verification succeeded/)).toHaveCount(0);
    } else {
      await expect(
        page.getByRole("heading", { name: LOCATION_A.name, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Verification required", { exact: true }),
      ).toHaveCount(0);
      await expect(challenge).toHaveCount(0);
    }
    expect(fixture.count(lifecyclePath)).toBe(readsBefore + 1);
    expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(1);
    expect(posts).toBe(0);
  });
}
