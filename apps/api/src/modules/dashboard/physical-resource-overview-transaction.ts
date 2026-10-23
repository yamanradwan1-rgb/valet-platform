import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import {
  beginTransactionOutcomes,
  finishTransactionOutcomes,
} from "../../common/database/postgres-transaction-outcome";
import {
  isGuestDatabaseOperation,
  remainingDatabaseOperationMs,
} from "../../common/database/runtime-database-deadline";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";
import {
  authorizePhysicalResourceManagement,
  type PhysicalResourceAuthority,
} from "./physical-resource-authorization";

/**
 * The Physical Resources overview requires one RR snapshot for its bounded
 * source queries. An LM grant fence acquired inside RR would see a stale MVCC
 * snapshot after an earlier writer; acquire the canonical SESSION advisory
 * before BEGIN instead. The hint is never authority and is rechecked in RR.
 *
 * Company Admin never holds the shared advisory: its existing MFA-gated
 * exclusive Management path runs in the RR transaction without lock upgrade.
 */
export async function inAuthorizedPhysicalResourceOverview<T>(
  pool: PostgresPool,
  context: StaffSessionContext,
  locationId: string,
  action: (
    transaction: PostgresTransaction,
    authority: PhysicalResourceAuthority,
  ) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let advisoryOrganizationId: string | null = null;
  let advisoryAttempted = false;
  let advisoryAcquired = false;
  let beginAttempted = false;
  let transactionStarted = false;
  let committing = false;
  let unusable = false;
  let shortened = false;
  try {
    const remaining = remainingDatabaseOperationMs();
    if (isGuestDatabaseOperation()) {
      const capability = await client.query<{ supports_timeout: boolean }>(
        "SELECT current_setting('server_version_num')::int >= 170000 AS supports_timeout",
      );
      if (capability.rows[0]?.supports_timeout) {
        shortened = true;
        await client.query(`SET transaction_timeout = '${remaining}ms'`);
      }
    }

    // Autocommit hint before RR exists. Recheck inside RR AFTER the lock.
    const managerHint = await authorizeDashboardLocation(
      client, context.userId, locationId, "DASHBOARD_ACCESS",
    );
    if (managerHint !== null) {
      advisoryOrganizationId = managerHint.organizationId;
      advisoryAttempted = true;
      await client.query(
        `SELECT pg_advisory_lock_shared(
           hashtextextended('staff-management-org:' || $1::text, 0)
         )`,
        [advisoryOrganizationId],
      );
      advisoryAcquired = true;
    }

    beginAttempted = true;
    await client.query("BEGIN");
    transactionStarted = true;
    beginTransactionOutcomes(client);
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const authority = await authorizePhysicalResourceManagement(
      client,
      context,
      locationId,
      "LIST",
      managerHint === null
        ? { kind: "RR_COMPANY_ADMIN_ONLY" }
        : { kind: "PRELOCKED_RR_LOCATION_MANAGER", hint: managerHint },
    );
    const result = await action(client, authority);
    if (isGuestDatabaseOperation()) remainingDatabaseOperationMs();
    committing = true;
    await client.query("COMMIT");
    transactionStarted = false;
    finishTransactionOutcomes(client, "COMMITTED");
    return result;
  } catch (error) {
    if (committing) unusable = true;
    if (advisoryAttempted && !advisoryAcquired) unusable = true;
    if (beginAttempted && !transactionStarted && !committing) unusable = true;
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
        finishTransactionOutcomes(client, committing ? "UNAVAILABLE" : "ROLLED_BACK");
        transactionStarted = false;
      } catch {
        unusable = true;
        finishTransactionOutcomes(client, "UNAVAILABLE");
      }
    }
    throw error;
  } finally {
    if (advisoryAcquired && advisoryOrganizationId !== null && !unusable) {
      try {
        const unlocked = await client.query<{ released: boolean }>(
          `SELECT pg_advisory_unlock_shared(
             hashtextextended('staff-management-org:' || $1::text, 0)
           ) AS released`,
          [advisoryOrganizationId],
        );
        if (unlocked.rows[0]?.released !== true) unusable = true;
      } catch {
        unusable = true;
      }
    }
    // Ambiguous lock acquisition or transaction end poisons this lease.
    if (advisoryAttempted && transactionStarted) unusable = true;
    if (shortened && !unusable) {
      try {
        await client.query("RESET transaction_timeout");
      } catch {
        unusable = true;
      }
    }
    client.release(unusable);
  }
}
