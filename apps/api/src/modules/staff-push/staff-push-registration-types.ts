import type { StaffPushRegistrationResponse } from "@valet/contracts";

export interface LockedStaffSessionRow {
  readonly created_at: Date;
  readonly id: string;
  readonly user_id: string;
}

export interface ActiveRegistrationRow {
  readonly app_build: string;
  readonly app_identifier: "com.vaylet.employee";
  readonly app_version: string;
  readonly id: string;
  readonly installation_id: string;
  readonly last_confirmed_at: Date;
  readonly locale: "en" | "ar";
  readonly owner_created_at: Date;
  readonly owner_current: boolean;
  readonly owner_user_id: string;
  readonly platform: "ANDROID";
  readonly provider: "FCM";
  readonly staff_auth_session_id: string;
  readonly token_hash: string;
}

export interface RegistrationRow {
  readonly app_build: string;
  readonly app_identifier: "com.vaylet.employee";
  readonly app_version: string;
  readonly id: string;
  readonly installation_id: string;
  readonly last_confirmed_at: Date;
  readonly locale: "en" | "ar";
  readonly platform: "ANDROID";
  readonly provider: "FCM";
  readonly staff_auth_session_id: string;
  readonly state: "ACTIVE" | "DISABLED" | "PROVIDER_INVALID" | "SUPERSEDED";
}

export function safeRegistrationResponse(
  row: RegistrationRow,
): StaffPushRegistrationResponse {
  return {
    appBuild: row.app_build,
    appIdentifier: row.app_identifier,
    appVersion: row.app_version,
    installationId: row.installation_id,
    lastConfirmedAt: row.last_confirmed_at.toISOString(),
    locale: row.locale,
    platform: row.platform,
    provider: row.provider,
    registrationId: row.id,
    state: row.state,
  };
}
