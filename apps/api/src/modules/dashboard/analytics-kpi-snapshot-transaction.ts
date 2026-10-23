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
import { MfaStepUpRequiredError } from "../auth/mfa/mfa-errors";
import { localMfaBypassEnabled } from "../auth/mfa/local-mfa-bypass";
import { requireCurrentMfaFactorFenceInRr } from "../auth/mfa/mfa-rr-factor-fence";
import {
  authorizeDashboardLocation,
  type DashboardLocationScope,
} from "./dashboard-location-authorization";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";

interface KpiViewer {
  readonly authenticatedUserId: string;
  readonly locationId: string;
  readonly recordManagementActivity?: boolean;
  readonly staffSessionContext?: StaffSessionContext;
}

/**
 * KPI source contracts require five queries against ONE REPEATABLE READ
 * snapshot. LM grant revocation also requires the Organization lock *before*
 * that snapshot is created. A transaction-scoped advisory acquired within RR
 * is too late: its first SELECT already fixes an old MVCC snapshot.
 *
 * Pin a single bounded runtime lease, obtain a non-authoritative LM hint in
 * autocommit, then acquire the canonical writer's SHARED SESSION advisory.
 * Only after it succeeds start RR and re-authorize LM from the fresh snapshot.
 * CA never holds the SHARED session advisory: the existing MFA-gated CA path
 * uses an EXCLUSIVE transaction advisory and must not upgrade shared locks.
 */
export async function inAuthorizedKpiSnapshot<T>(
  pool: PostgresPool,
  input: KpiViewer,
  action: (transaction: PostgresTransaction, scope: DashboardLocationScope) => Promise<T>,
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
    // The first hint is not an authorization grant or a response. It is
    // re-evaluated after obtaining the writer-compatible advisory below.
    const managerHint = await authorizeDashboardLocation(
      client, input.authenticatedUserId, input.locationId, "DASHBOARD_ACCESS",
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
    // No SELECT ran in this transaction: the first RR snapshot is created
    // by the post-lock authorization, not the earlier autocommit hint.
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const scope = managerHint === null
      ? await authorizeDashboardReadLocation(client, {
          authenticatedUserId: input.authenticatedUserId,
          capability: "ANALYTICS_READ",
          recordActivity: input.recordManagementActivity !== false,
          ...(input.staffSessionContext === undefined
            ? {} : { staffSessionContext: input.staffSessionContext }),
          targetLocationId: input.locationId,
        })
      : await authorizeDashboardLocation(
          client, input.authenticatedUserId, input.locationId, "DASHBOARD_ACCESS",
        );
    // A role, membership, Location or Organization transition between hint
    // and lock is denied; a future request may take the CA path under MFA.
    const authorizedScope = scope !== null &&
      (managerHint === null ||
        (scope.membershipId === managerHint.membershipId &&
          scope.organizationId === managerHint.organizationId))
      ? scope : null;
    assertAuthorized(authorizedScope);
    if (managerHint === null && !localMfaBypassEnabled()) {
      // The CA Management path has already locked the Staff session/User and
      // the Organization. A plain RR EXISTS check could still see a factor
      // retired by recovery after the first authorization snapshot. A row
      // SHARE lock either fences recovery until COMMIT or raises 40001 when
      // its UPDATE committed after this snapshot. The KPI caller retries the
      // ENTIRE transaction on 40001 against fresh authorization state.
      const context = input.staffSessionContext;
      if (context === undefined) throw new MfaStepUpRequiredError();
      await requireCurrentMfaFactorFenceInRr(client, context);
    }
    const result = await action(client, authorizedScope);
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
    // A failed/ambiguous advisory acquisition or rollback may leave a session
    // lock. Never return that connection to the pool.
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
