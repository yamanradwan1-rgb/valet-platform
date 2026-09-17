import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PaymentCollectionDatabaseContext } from "./payment-collection-database-context.js";

const context = new PaymentCollectionDatabaseContext();

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("migration 28 payment collection operation", () => {
  it("is the sole 28th migration with the exact lifecycle enum", async () => {
    expect(context.migrationDirectories).toHaveLength(43);
    expect(context.migrationDirectories.at(27)).toBe(
      "20260816002800_phase6_payment_collection_operation",
    );
    const values = await context.client.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'payment_collection_operation_state'::regtype
       ORDER BY enumsortorder`,
    );
    expect(values.rows.map((row) => row.enumlabel)).toEqual([
      "PREPARED",
      "OUTCOME_UNKNOWN",
      "REFERENCE_ATTACHED",
      "REJECTED",
      "RESOLVED",
    ]);
  });

  it("creates exactly the focused durable columns", async () => {
    const result = await context.client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'payment_collection_operations'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "payment_id",
      "submission_idempotency_key",
      "amount",
      "currency",
      "provider",
      "state",
      "provider_reference",
      "safe_result_code",
      "dispatch_guarded_at",
      "resolved_at",
      "created_at",
      "updated_at",
    ]);
  });

  it("creates scoped uniqueness and same-Organization Payment ownership", async () => {
    const indexes = await context.client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'payment_collection_operations'
       ORDER BY indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "payment_collection_operations_one_unresolved_payment_idx",
      "payment_collection_operations_org_payment_history_idx",
      "payment_collection_operations_org_provider_reference_key",
      "payment_collection_operations_org_submission_key",
      "payment_collection_operations_pkey",
    ]);
    const foreignKeys = await context.client.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'payment_collection_operations'::regclass
         AND contype = 'f' ORDER BY conname`,
    );
    expect(foreignKeys.rows.map((row) => row.conname)).toEqual([
      "payment_collection_operations_org_payment_id_fkey",
      "payment_collection_operations_organization_id_fkey",
    ]);
  });
});
