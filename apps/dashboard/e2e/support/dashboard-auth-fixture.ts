import { randomUUID } from "node:crypto";
import type { Request } from "@playwright/test";
import { authPayload } from "./fixture-data";
import type { FixtureReply } from "./dashboard-api-fixture";

const cookieName = "vaylet_e2e_refresh";
const cookieValue = "fixture";

/** A separate login means a separate logical session, even for the same email. */
export class DashboardAuthFixture {
  staffAuthSessionId = randomUUID();
  login(): FixtureReply {
    this.staffAuthSessionId = randomUUID();
    return {
      body: authPayload("A", this.staffAuthSessionId),
      headers: {
        "set-cookie": `${cookieName}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax`,
      },
    };
  }
  hasCookie(request: Request) {
    return (
      request.headers().cookie?.includes(`${cookieName}=${cookieValue}`) ===
      true
    );
  }
  refresh(request: Request): FixtureReply {
    return this.hasCookie(request)
      ? { body: authPayload("B", this.staffAuthSessionId) }
      : {
          status: 401,
          body: {
            code: "STAFF_AUTHENTICATION_REQUIRED",
            message: "STAFF_AUTHENTICATION_REQUIRED",
            requestId: "e2e-401",
          },
        };
  }
  logout(): FixtureReply {
    return {
      body: {},
      headers: {
        "set-cookie": `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
      },
    };
  }
}
