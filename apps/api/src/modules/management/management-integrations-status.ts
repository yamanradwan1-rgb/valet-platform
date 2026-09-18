import type {
  ManagementIntegrationStatus,
  ManagementIntegrationsResponse,
} from "@valet/contracts";

import { resolvePlateOcrConfig } from "../check-in-api/plate-ocr-config";
import {
  DigitalPaymentProviderRegistry,
  UnconfiguredDigitalPaymentProviderRegistry,
} from "../payments/digital-payment-provider";
import { readFcmHttpV1Config } from "../staff-push/fcm-http-v1-config";
import { readStaffPushOperationalPolicy } from "../staff-push/staff-push-operational-policy";

function plateOcrStatus(env: NodeJS.ProcessEnv): ManagementIntegrationStatus {
  const resolution = resolvePlateOcrConfig(env);
  if (resolution.status === "unavailable") {
    return resolution.reason === "provider-config-missing"
      ? "UNAVAILABLE"
      : "MISCONFIGURED";
  }
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test")
    return "UNAVAILABLE";
  return "UNKNOWN";
}

function staffPushStatus(env: NodeJS.ProcessEnv): ManagementIntegrationStatus {
  try {
    const policy = readStaffPushOperationalPolicy(env);
    if (!policy.creationEnabled || !policy.sendingEnabled) return "DISABLED";
    const config = readFcmHttpV1Config(
      env,
      policy.sendingEnabled,
      policy.providerCallTimeoutSeconds,
    );
    return config === undefined ? "MISCONFIGURED" : "UNKNOWN";
  } catch {
    return "MISCONFIGURED";
  }
}

function digitalPaymentStatus(
  registry: DigitalPaymentProviderRegistry,
): ManagementIntegrationStatus {
  return registry instanceof UnconfiguredDigitalPaymentProviderRegistry
    ? "UNAVAILABLE"
    : "UNKNOWN";
}

export function projectManagementIntegrations(
  organizationId: string,
  env: NodeJS.ProcessEnv,
  paymentRegistry: DigitalPaymentProviderRegistry,
): ManagementIntegrationsResponse {
  return {
    organizationId,
    integrations: [
      { key: "PLATE_OCR", status: plateOcrStatus(env) },
      { key: "STAFF_PUSH", status: staffPushStatus(env) },
      {
        key: "DIGITAL_PAYMENT",
        status: digitalPaymentStatus(paymentRegistry),
      },
    ],
  };
}
