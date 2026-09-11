import {
  type StaffPushRegistrationRequest,
  type StaffPushRegistrationResponse,
} from "@valet/contracts";
import type { EmployeeLocale } from "@valet/employee-client";

import type { NativePushRuntimeMetadata } from "./native-push-types";

export interface ConfirmedNativePushState extends NativePushRuntimeMetadata {
  readonly locale: EmployeeLocale;
  readonly token: string;
}

export function nativePushResponseMatches(
  response: StaffPushRegistrationResponse,
  request: StaffPushRegistrationRequest,
): boolean {
  return (
    response.state === "ACTIVE" &&
    response.provider === request.provider &&
    response.platform === request.platform &&
    response.installationId === request.installationId &&
    response.appIdentifier === request.appIdentifier &&
    response.appVersion === request.appVersion &&
    response.appBuild === request.appBuild &&
    response.locale === request.locale
  );
}

export function nativePushRequestIsCurrent(
  request: StaffPushRegistrationRequest,
  token: string | undefined,
  locale: EmployeeLocale,
  metadata: NativePushRuntimeMetadata | undefined,
): boolean {
  return (
    token === request.providerToken &&
    locale === request.locale &&
    metadata?.appBuild === request.appBuild &&
    metadata.appVersion === request.appVersion
  );
}

export function nativePushDesiredStateMatches(
  confirmed: ConfirmedNativePushState | undefined,
  token: string,
  locale: EmployeeLocale,
  metadata: NativePushRuntimeMetadata,
): boolean {
  return (
    confirmed?.token === token &&
    confirmed.locale === locale &&
    confirmed.appBuild === metadata.appBuild &&
    confirmed.appVersion === metadata.appVersion
  );
}
