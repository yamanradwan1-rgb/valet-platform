import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import {
  beginTransactionOutcomes,
  finishTransactionOutcomes,
} from "../../common/database/postgres-transaction-outcome";
import {
  isGuestDatabaseOperation,
  remainingDatabaseOperationMs,
} from "../../common/database/runtime-database-deadline";
import { MfaStepUpRequiredError } from "../auth/mfa/mfa-errors";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { localMfaBypassEnabled } from "../auth/mfa/local-mfa-bypass";
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
 * Company Admin never holds the shared organization advisory: its existing
 * MFA-gated exclusive Management path runs in RR. A fresh pre-BEGIN MFA
 * preflight and a locked factor recheck guard against retired-factor snapshots.
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
  // A factor UPDATE committed after RR's first snapshot raises 40001 when the
  // guarded factor is SHARE-locked. Start again with fresh eligibility/MFA
  // rather than retrying a query against the stale snapshot.
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await inAuthorizedPhysicalResourceOverviewAttempt(
        pool, context, locationId, action,
      );
    } catch (error) {
      if (
        (error as { readonly code?: unknown }).code !== "40001" ||
        attempt === 5
      ) throw error;
    }
  }
  throw new Error("Physical overview serialization retry exhausted.");
}

async function inAuthorizedPhysicalResourceOverviewAttempt<T>(
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
    } else {
      // A non-authoritative eligibility preflight keeps unrelated users on the
      // existing 404 path. The exact CA scope and MFA are checked again in RR.
      const eligible = await client.query(
        `SELECT 1
         FROM organization_memberships AS membership
         INNER JOIN organizations AS organization
           ON organization.id = membership.organization_id
         INNER JOIN locations AS location
           ON location.organization_id = organization.id
         WHERE membership.user_id = $1
           AND membership.status = 'ACTIVE'
           AND membership.role = 'ORG_ADMIN'
           AND organization.status = 'ACTIVE'
           AND location.id = $2
         LIMIT 1`,
        [context.userId, locationId],
      );
      if (eligible.rowCount === 1) {
        const isolation = await client.query<{ readCommitted: boolean }>(
          `SELECT current_setting('transaction_isolation') = 'read committed'
             AS "readCommitted"`,
        );
        if (isolation.rows[0]?.readCommitted !== true) {
          throw new MfaStepUpRequiredError();
        }
        await requireMfaAssuranceInTransaction(client, context, {
          sensitive: false,
        });
      }
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
    if (authority.role === "ORG_ADMIN" && !localMfaBypassEnabled()) {
      // Management already holds this exact session/User FOR UPDATE. Lock the
      // corresponding active factor through the projection and COMMIT.
      // PostgreSQL RR raises 40001 if recovery retired the factor after the
      // snapshot was first taken; the outer boundary retries fresh.
      const factor = await client.query(
        `SELECT factor.id
         FROM staff_auth_sessions AS session
         INNER JOIN user_mfa_totp_factors AS factor
           ON factor.id = session.mfa_factor_id
          AND factor.user_id = session.user_id
         WHERE session.id = $1
           AND session.user_id = $2
           AND session.current_access_token_hash = $3
           AND factor.state = 'ACTIVE'
         FOR SHARE OF factor`,
        [context.staffAuthSessionId, context.userId, context.accessTokenHash],
      );
      if (factor.rowCount !== 1) throw new MfaStepUpRequiredError();
    }
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
