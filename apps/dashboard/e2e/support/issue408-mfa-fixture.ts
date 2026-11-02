import { expect, type Page } from "@playwright/test";
import { DashboardApiFixture, E2E_IDS } from "./dashboard-api-fixture";

export const disablePath = "/v1/staff/auth/mfa/disable";
export class Issue408MfaFixture extends DashboardApiFixture {
  availability = "AVAILABLE";
  factorId: string = E2E_IDS.factor;
  posts: Record<string, unknown>[] = [];
  outcome:
    | "success"
    | "invalid"
    | "busy"
    | "changed"
    | "policy"
    | "unknown"
    | "session" = "success";
  constructor() {
    super({
      mfaState: "ASSURED",
      override: async (path, request) => {
        if (path !== disablePath) return;
        if (
          this.mfaState === "ASSURED" &&
          this.availability === "MFA_NOT_ENABLED"
        )
          this.availability = "AVAILABLE";
        if (request.method() === "GET")
          return {
            body:
              this.availability === "AVAILABLE"
                ? {
                    availability: this.availability,
                    expectedFactorId: this.factorId,
                  }
                : { availability: this.availability },
          };
        this.posts.push(request.postDataJSON());
        if (this.outcome === "success") {
          this.commit();
          return { body: { state: "ENROLLMENT_REQUIRED" } };
        }
        if (this.outcome === "unknown") {
          this.commit();
          return {
            status: 500,
            body: {
              code: "INTERNAL_ERROR",
              message: "The operation could not be completed.",
              requestId: "issue408-unknown",
            },
          };
        }
        const code = {
          invalid: "MFA_VERIFICATION_FAILED",
          busy: "MFA_OPERATION_BUSY",
          changed: "MFA_STATE_CHANGED",
          policy: "MFA_DISABLE_NOT_ALLOWED",
          session: "STAFF_AUTHENTICATION_REQUIRED",
        }[this.outcome];
        return {
          status:
            this.outcome === "invalid" || this.outcome === "policy"
              ? 403
              : this.outcome === "session"
                ? 401
                : 409,
          body: {
            code,
            message: "Safe fixture error",
            requestId: "issue408-failure",
          },
        };
      },
    });
  }
  commit() {
    this.mfaState = "ENROLLMENT_REQUIRED";
    this.mfaAssured = false;
    this.availability = "MFA_NOT_ENABLED";
  }
}
export async function openSecurity(page: Page, f: Issue408MfaFixture) {
  await f.install(page);
  await page.goto("/security");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Security", exact: true }),
  ).toBeVisible();
}
export async function openDisable(page: Page) {
  await page.getByRole("button", { name: "Disable MFA", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Disable MFA", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
