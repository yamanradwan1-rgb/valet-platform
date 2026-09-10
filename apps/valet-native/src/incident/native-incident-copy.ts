import type {
  EmployeeLocale,
  IncidentSeverity,
  IncidentType,
} from "@valet/employee-client";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";
import { NATIVE_INCIDENT_OPERATION_FAILED } from "./native-incident-error";

interface NativeIncidentCopy {
  readonly back: string;
  readonly cannotEstablishSession: string;
  readonly describeIncident: string;
  readonly failure: string;
  readonly incidentOpened: string;
  readonly loadingSession: string;
  readonly openIncident: string;
  readonly opening: string;
  readonly reference: string;
  readonly reportIncident: string;
  readonly retry: string;
  readonly returnLabel: string;
  readonly selectType: string;
  readonly sessionContextError: string;
  readonly sessionLabel: string;
  readonly severityLabel: string;
  readonly typeLabel: string;
  readonly vehicle: string;
  readonly types: Readonly<Record<IncidentType, string>>;
  readonly severities: Readonly<Record<IncidentSeverity, string>>;
}

export function getNativeIncidentCopy(
  locale: EmployeeLocale,
): NativeIncidentCopy {
  const d = getNativeEmployeeDictionary(locale);
  return {
    back: d.back,
    cannotEstablishSession: d.cannotEstablishSession,
    describeIncident: d.describeIncident,
    failure: d.operationFailed,
    incidentOpened: d.incidentOpened,
    loadingSession: d.loadingSession,
    openIncident: d.openIncident,
    opening: d.opening,
    reference: d.reference,
    reportIncident: d.reportIncident,
    retry: d.retry,
    returnLabel: d.returnLabel,
    selectType: d.selectType,
    sessionContextError: d.sessionContextError,
    sessionLabel: d.sessionLabel,
    severityLabel: d.severityLabel,
    typeLabel: d.typeLabel,
    vehicle: d.vehicle,
    types: {
      CUSTOMER_COMPLAINT: d.customerComplaint,
      EMPLOYEE_SAFETY: d.employeeSafety,
      KEY_DAMAGED: d.keyDamaged,
      KEY_LOCKED_INSIDE: d.keyLockedInside,
      KEY_MISSING: d.keyMissing,
      OTHER: d.other,
      PAYMENT_DISPUTE: d.paymentDispute,
      SYSTEM_CONNECTION: d.systemConnection,
      UNAUTHORIZED_ZONE_EXIT: d.unauthorizedZoneExit,
      VEHICLE_DAMAGE: d.vehicleDamage,
      WRONG_KEY: d.wrongKey,
      WRONG_VEHICLE_HANDOFF_ATTEMPT: d.wrongVehicleHandoff,
    },
    severities: {
      CRITICAL: d.critical,
      HIGH: d.high,
      LOW: d.low,
      MEDIUM: d.medium,
    },
  };
}

export function presentNativeIncidentFailure(
  locale: EmployeeLocale,
  safeEnglishMessage: string,
): string {
  const d = getNativeEmployeeDictionary(locale);
  return locale === "ar" ||
    safeEnglishMessage === NATIVE_INCIDENT_OPERATION_FAILED
    ? d.operationFailed
    : safeEnglishMessage;
}
