export interface WhatsAppPolicyMutation {
  readonly enabled: boolean | null;
  readonly language: "ar" | "en" | null;
  readonly templateCatalogVersion: string | null;
  readonly providerBindingId: string | null;
  readonly expectedRevision: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateWhatsAppPolicy(value: unknown): WhatsAppPolicyMutation {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new ApiTransportValidationError();
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length !== 6 ||
    keys.some((key) => !["enabled", "language", "templateCatalogVersion",
      "providerBindingId", "revision", "expectedRevision"].includes(key)) ||
    !(row.enabled === null || typeof row.enabled === "boolean") ||
    !(row.language === null || row.language === "ar" || row.language === "en") ||
    !(row.templateCatalogVersion === null ||
      (typeof row.templateCatalogVersion === "string" &&
        /^[a-zA-Z0-9_.-]{1,128}$/.test(row.templateCatalogVersion))) ||
    !(row.providerBindingId === null ||
      (typeof row.providerBindingId === "string" && uuid.test(row.providerBindingId))) ||
    !Number.isInteger(row.revision) || !Number.isInteger(row.expectedRevision) ||
    row.revision !== row.expectedRevision || Number(row.expectedRevision) < 0) {
    throw new ApiTransportValidationError();
  }
  return row as unknown as WhatsAppPolicyMutation;
}

import { ApiTransportValidationError } from "../../common/http/api-errors";
