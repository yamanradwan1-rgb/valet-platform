import { createHash, randomUUID } from "node:crypto";

import type { StaffPushRegistrationRequest } from "@valet/contracts";

import {
  type AuthHttpResult,
  StaffAuthNativeFixture,
} from "./staff-auth-native-fixture";

export interface StaffPushAuth {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly sessionId: string;
  readonly userId: string;
}

export interface StaffPushRegistrationRow {
  readonly app_build: string;
  readonly app_version: string;
  readonly id: string;
  readonly installation_id: string;
  readonly last_confirmed_at: Date;
  readonly locale: string;
  readonly provider_token: string | null;
  readonly staff_auth_session_id: string;
  readonly state: string;
  readonly superseded_by_registration_id: string | null;
  readonly terminal_at: Date | null;
  readonly terminal_reason_class: string | null;
  readonly token_hash: string;
}

export class StaffPushApiFixture extends StaffAuthNativeFixture {
  requestBody(
    overrides: Partial<StaffPushRegistrationRequest> = {},
  ): StaffPushRegistrationRequest {
    return {
      appBuild: "100",
      appIdentifier: "com.vaylet.employee",
      appVersion: "1.0.0",
      installationId: randomUUID(),
      locale: "en",
      platform: "ANDROID",
      provider: "FCM",
      providerToken: `synthetic-provider-token-${randomUUID()}`,
      ...overrides,
    };
  }

  async login(user?: {
    readonly email: string;
    readonly id: string;
    readonly password: string;
  }): Promise<StaffPushAuth> {
    const current = user ?? (await this.createUser());
    const result = await this.request("/v1/staff/auth/native/login", {
      body: { email: current.email, password: current.password },
    });
    const accessToken = String(result.body?.accessToken);
    const refreshToken = String(result.body?.refreshToken);
    const accessHash = `staff-access-sha256:v1:${createHash("sha256")
      .update(accessToken)
      .digest("hex")}`;
    const session = await this.query<{ id: string }>(
      `SELECT id FROM staff_auth_sessions
       WHERE current_access_token_hash = $1`,
      [accessHash],
    );
    return {
      accessToken,
      refreshToken,
      sessionId: session.rows[0]!.id,
      userId: current.id,
    };
  }

  put(
    auth: Pick<StaffPushAuth, "accessToken">,
    body: unknown,
    suffix = "",
  ): Promise<AuthHttpResult> {
    return this.request(`/v1/staff/push/registrations${suffix}`, {
      authorization: `Bearer ${auth.accessToken}`,
      body,
      method: "PUT",
    });
  }

  disable(
    auth: Pick<StaffPushAuth, "accessToken">,
    registrationId: string,
    body: unknown = {},
    suffix = "",
  ): Promise<AuthHttpResult> {
    return this.request(
      `/v1/staff/push/registrations/${registrationId}/disable${suffix}`,
      {
        authorization: `Bearer ${auth.accessToken}`,
        body,
      },
    );
  }

  registrations() {
    return this.query<StaffPushRegistrationRow>(
      `SELECT id, staff_auth_session_id, installation_id, provider_token,
              token_hash, app_version, app_build, locale, state,
              last_confirmed_at, terminal_at,
              terminal_reason_class, superseded_by_registration_id
       FROM staff_push_registrations ORDER BY created_at, id`,
    );
  }

  registrationId(result: AuthHttpResult): string {
    return String(result.body?.registrationId);
  }
}
