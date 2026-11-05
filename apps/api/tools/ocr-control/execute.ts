import { parseOcrControlCommand, type OcrControlCommand } from "./input";
import {
  OcrToolError,
  withRestrictedOcrClient,
  type OcrToolClient,
} from "./restricted-connection";

interface OcrOperatorResponse {
  readonly action: OcrControlCommand["action"];
  readonly operationId: string;
  readonly result: string;
}

function statement(input: OcrControlCommand): {
  sql: string;
  values: unknown[];
  field: string;
} {
  switch (input.action) {
    case "provision-period":
      return {
        sql: "SELECT public.ocr_operator_provision_period($1::uuid,$2::text,$3::timestamptz,$4::timestamptz,$5::bigint,$6::text,$7::text) AS period_id",
        values: [
          input.operationId,
          input.accountAlias,
          input.startsAt,
          input.endsAt,
          input.quotaUnits,
          input.reasonCode,
          input.evidenceRef,
        ],
        field: "period_id",
      };
    case "set-org":
      return {
        sql: "SELECT public.ocr_operator_set_org($1::uuid,$2::uuid,$3::bigint,$4::boolean,$5::integer,$6::text,$7::text) AS revision",
        values: [
          input.operationId,
          input.organizationId,
          input.expectedRevision,
          input.enabled,
          input.concurrencyCap,
          input.reasonCode,
          input.evidenceRef,
        ],
        field: "revision",
      };
    case "allocate":
      return {
        sql: "SELECT public.ocr_operator_allocate($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::bigint,$6::text,$7::text) AS revision",
        values: [
          input.operationId,
          input.periodId,
          input.organizationId,
          input.expectedRevision,
          input.quotaUnits,
          input.reasonCode,
          input.evidenceRef,
        ],
        field: "revision",
      };
    case "set-platform":
      return {
        sql: "SELECT public.ocr_operator_set_platform($1::uuid,$2::bigint,$3::boolean,$4::text,$5::integer,$6::text,$7::text) AS revision",
        values: [
          input.operationId,
          input.expectedRevision,
          input.enabled,
          input.accountAlias,
          input.concurrencyCap,
          input.reasonCode,
          input.evidenceRef,
        ],
        field: "revision",
      };
    case "activate-period":
      return {
        sql: "SELECT public.ocr_operator_activate_period($1::uuid,$2::bigint,$3::uuid,$4::text,$5::text) AS revision",
        values: [
          input.operationId,
          input.expectedRevision,
          input.periodId,
          input.reasonCode,
          input.evidenceRef,
        ],
        field: "revision",
      };
    case "resolve-attempt":
      return {
        sql: "SELECT public.ocr_operator_resolve_attempt($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text,$7::text) AS revision",
        values: [
          input.operationId,
          input.attemptId,
          input.organizationId,
          input.expectedRevision,
          input.proofCode,
          input.reasonCode,
          input.evidenceRef,
        ],
        field: "revision",
      };
  }
}

export async function executeOcrControl(
  client: OcrToolClient,
  input: OcrControlCommand,
): Promise<OcrOperatorResponse> {
  const command = statement(input);
  const result = await client.query<Record<string, unknown>>(
    command.sql,
    command.values,
  );
  const value = result.rows[0]?.[command.field];
  if (
    result.rowCount !== 1 ||
    !(
      typeof value === "number" ||
      typeof value === "bigint" ||
      typeof value === "string"
    )
  ) {
    throw new OcrToolError("OCR control result unavailable.");
  }
  return {
    action: input.action,
    operationId: input.operationId,
    result: String(value),
  };
}

export async function runOcrControl(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<OcrOperatorResponse> {
  const input = parseOcrControlCommand(args);
  return withRestrictedOcrClient("operator", environment, (client) =>
    executeOcrControl(client, input),
  );
}
