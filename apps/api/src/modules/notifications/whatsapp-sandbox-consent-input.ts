import { ApiTransportValidationError } from "../../common/http/api-errors";

export interface SandboxConsentInput {
  readonly action: "GRANT" | "WITHDRAW";
  readonly evidenceReference: string;
  readonly expectedRevision: number;
  readonly explicitOwnerConfirmation: true;
}

/** No client-supplied phone/digest, org, timestamp or expiry is accepted. */
export function validateSandboxConsentInput(value: unknown): SandboxConsentInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiTransportValidationError();
  }
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 4 ||
      Object.keys(row).some((key) =>
        !["action","evidenceReference","expectedRevision","explicitOwnerConfirmation"]
          .includes(key)) ||
      (row.action !== "GRANT" && row.action !== "WITHDRAW") ||
      typeof row.evidenceReference !== "string" ||
      !/^wa310-opt-in-[A-Za-z0-9_-]{8,80}$/.test(row.evidenceReference) ||
      !Number.isInteger(row.expectedRevision) ||
      Number(row.expectedRevision) < 0 ||
      Number(row.expectedRevision) > 1000000 ||
      row.explicitOwnerConfirmation !== true) {
    throw new ApiTransportValidationError();
  }
  return row as unknown as SandboxConsentInput;
}

export function sandboxConsentScopeAllowed(
  env: NodeJS.ProcessEnv, organization: string, database: string,
): boolean {
  return env.NODE_ENV === "test" && env.OUTBOUND_MESSAGING_MODE === "test" &&
    env.OUTBOUND_META_TEST_DATABASE_NAME === "vaylet_wa310" &&
    env.OUTBOUND_META_TEST_ORGANIZATION_ID === organization &&
    database === "vaylet_wa310";
}
