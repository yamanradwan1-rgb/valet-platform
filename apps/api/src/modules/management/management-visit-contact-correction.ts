import type { PostgresTransaction } from "../../common/database/postgres";
import { ManagementAccessDeniedError } from "./management-authorization";

export type VisitContactCorrectionCode =
  | "CONFIGURATION_VALUE_INVALID"
  | "VERSION_CONFLICT";

export class VisitContactCorrectionError extends Error {
  constructor(readonly code: VisitContactCorrectionCode) {
    super(code === "VERSION_CONFLICT"
      ? "The Visit Contact changed before this correction."
      : "The Visit Contact correction is invalid.");
    this.name = "VisitContactCorrectionError";
  }
}

interface CorrectionRow {
  readonly changed: boolean;
  readonly result_code: "OK" | VisitContactCorrectionCode;
  readonly updated_at: Date | null;
}

function databaseError(error: unknown): never {
  if (String((error as { code?: unknown }).code ?? "") === "42501") {
    throw new ManagementAccessDeniedError();
  }
  throw error;
}

async function correction(
  transaction: PostgresTransaction,
  sql: string,
  parameters: readonly unknown[],
): Promise<{ readonly changed: boolean; readonly updatedAt: Date }> {
  try {
    const row = (await transaction.query<CorrectionRow>(sql, [...parameters])).rows[0];
    if (row === undefined) throw new Error("Visit Contact correction returned no row.");
    if (row.result_code !== "OK") {
      throw new VisitContactCorrectionError(row.result_code);
    }
    if (row.updated_at === null) throw new Error("Visit Contact correction returned no timestamp.");
    return { changed: row.changed, updatedAt: row.updated_at };
  } catch (error) {
    if (error instanceof VisitContactCorrectionError ||
        error instanceof ManagementAccessDeniedError) throw error;
    return databaseError(error);
  }
}

export function correctVisitContactName(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly customerId: string;
    readonly displayName: string | null;
    readonly expectedUpdatedAt: Date;
    readonly organizationId: string;
  },
) {
  return correction(
    transaction,
    `SELECT * FROM management_visit_contact_correct_name(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::timestamptz)`,
    [input.actorMembershipId, input.organizationId, input.customerId,
      input.displayName, input.expectedUpdatedAt],
  );
}

export function correctVisitContactPhone(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly customerId: string;
    readonly expectedUpdatedAt: Date;
    readonly organizationId: string;
    readonly phoneNormalized: string;
  },
) {
  return correction(
    transaction,
    `SELECT * FROM management_visit_contact_correct_phone(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::timestamptz)`,
    [input.actorMembershipId, input.organizationId, input.customerId,
      input.phoneNormalized, input.expectedUpdatedAt],
  );
}
