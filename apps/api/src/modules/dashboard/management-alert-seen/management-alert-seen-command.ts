import type { PostgresPool } from "../../../common/database/postgres";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../../auth/staff-session-context";
import { ManagementAccessDeniedError } from "../../management/management-authorization";
import { authorizeSeenOccurrenceAudience } from "./management-alert-seen-authorization";
import { insertAuthorizedSeenReceipt, type SeenReceiptIdentity } from "./management-alert-seen-repository";
import { readCommittedSeenSourceTime, type SeenOccurrenceCategory } from "./management-alert-seen-source";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories: ReadonlySet<string> = new Set(["ALT-05", "ALT-07", "ALT-09", "ALT-13", "ALT-15"]);

/**
 * Server-confirmed explicit per-item Seen; NO GET/bell-open side effects.
 * sourceId = canonical Task / Shift / staff Membership; episodeId = source
 * operation / audit event UUID, verified against persistence in one transaction.
 * No HTTP route/flag is installed by this independent workstream.
 */
export async function markManagementAlertOccurrenceSeen(
  pool: PostgresPool,
  input: {
    readonly context: StaffSessionContext;
    readonly locationId: string;
    readonly category: string;
    readonly sourceId: string;
    readonly episodeId: string;
  },
): Promise<SeenReceiptIdentity> {
  if (!categories.has(input.category) || !uuid.test(input.locationId)
    || !uuid.test(input.sourceId) || !uuid.test(input.episodeId)) {
    throw new ManagementAccessDeniedError();
  }
  const category = input.category as SeenOccurrenceCategory;
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeSeenOccurrenceAudience(transaction, {
      context: input.context,
      locationId: input.locationId,
      category,
    });
    const occurredAt = await readCommittedSeenSourceTime(transaction, {
      ...scope,
      locationId: input.locationId,
      category,
      sourceId: input.sourceId,
      episodeId: input.episodeId,
    });
    return insertAuthorizedSeenReceipt(transaction, {
      ...scope,
      category,
      episodeId: input.episodeId,
      occurredAt,
    });
  });
}
