import type { PostgresPool, PostgresTransaction } from '../../common/database/postgres';
import { inPostgresTransaction } from '../../common/database/postgres-transaction';
import { recordAdminActivityInTransaction } from '../auth/mfa/mfa-assurance-policy';
import { requireCurrentMfaFactorFenceInRr } from '../auth/mfa/mfa-rr-factor-fence';
import type { StaffSessionContext } from '../auth/staff-session-context';
import { authorizeCompanyAdminManagement } from './management-authorization';

const maximumFreshSnapshotAttempts = 5;

/**
 * The two bounded Company Admin read projections share this RR contract.
 * Canonical Management authorization establishes session/User then exclusive
 * Organization ordering. A factor SHARE lock follows, and is held through
 * the projection and commit. 40001 must retry the entire fresh transaction,
 * never a statement within a stale RR snapshot.
 */
export async function inFencedCompanyAdminRrSnapshot<T>(
  pool: PostgresPool,
  context: StaffSessionContext,
  organizationId: string,
  capability: 'ANALYTICS_READ' | 'REPORTS_READ',
  project: (transaction: PostgresTransaction, authorizedOrgId: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= maximumFreshSnapshotAttempts; attempt += 1) {
    try {
      return await inPostgresTransaction(pool, async (transaction) => {
        await transaction.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        const scope = await authorizeCompanyAdminManagement(transaction, context, {
          capability,
          organizationId,
        });
        await requireCurrentMfaFactorFenceInRr(transaction, context);
        const projection = await project(transaction, scope.organizationId);
        await recordAdminActivityInTransaction(transaction, context);
        return projection;
      });
    } catch (error) {
      if ((error as { readonly code?: unknown }).code !== '40001' ||
          attempt === maximumFreshSnapshotAttempts) throw error;
    }
  }
  throw new Error('Company Admin RR authorization retry exhausted.');
}
