import type { PostgresTransaction } from "./postgres";

export async function lockManagementSettingsOrganization(
  transaction: PostgresTransaction,
  organizationId: string,
  mode: "EXCLUSIVE" | "SHARED",
): Promise<void> {
  await transaction.query(
    mode === "SHARED"
      ? `SELECT pg_advisory_xact_lock_shared(
           hashtextextended('management-settings-org:' || $1::text, 0)
         )`
      : `SELECT pg_advisory_xact_lock(
           hashtextextended('management-settings-org:' || $1::text, 0)
         )`,
    [organizationId],
  );
}
