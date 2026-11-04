import { randomUUID } from "node:crypto";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findFinancialAlertCaseById,
  queryFinancialAlertCases,
} from "../src/modules/dashboard/management-alert-sources/financial-alert-source-query";
import type { FinancialAlertExactReaderInput } from "../src/modules/dashboard/management-alert-sources/financial-alert-source-types";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

export interface CollectionSeed {
  readonly paymentId: string;
  readonly operationId: string;
  readonly reference: string;
  readonly sessionId: string;
}

export class FinancialAlertTestContext extends DashboardOverviewTestContext {
  constructor(label: string) {
    super(`414-finance-${label}`);
  }

  async seedUnresolved(
    state: "OUTCOME_UNKNOWN" | "REFERENCE_ATTACHED" = "OUTCOME_UNKNOWN",
    elapsedSeconds = 240,
    operationId: string = randomUUID(),
  ): Promise<CollectionSeed> {
    const manager = await this.managerFixture();
    const sessionId = await this.seedSession({ state: "PARKED" });
    const paymentId = randomUUID();
    const reference = `reference-${randomUUID()}`;
    const providerReference = state === "REFERENCE_ATTACHED" ? reference : null;
    await this.adminPool.query(
      `INSERT INTO payments
         (id, organization_id, location_id, valet_session_id,
          service_payer, collection_method, currency, service_amount,
          tip_amount, amount_due, amount_paid, status,
          creation_idempotency_key, provider, provider_reference, updated_at)
       VALUES ($1,$2,$3,$4,'CUSTOMER','DIGITAL','JOD',
               5,0,5,0,'UNPAID',$5,'provider-a',$6,clock_timestamp())`,
      [
        paymentId,
        manager.organizationId,
        manager.locationId,
        sessionId,
        randomUUID(),
        providerReference,
      ],
    );
    await this.adminPool.query(
      `INSERT INTO payment_collection_operations
         (id, organization_id, payment_id, submission_idempotency_key,
          amount, currency, provider, state, provider_reference,
          dispatch_guarded_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,5,'JOD','provider-a',$5,$6,
               clock_timestamp() - $7::integer * INTERVAL '1 second',
               clock_timestamp() - ($7::integer + 60) * INTERVAL '1 second',
               clock_timestamp())`,
      [
        operationId,
        manager.organizationId,
        paymentId,
        randomUUID(),
        state,
        providerReference,
        elapsedSeconds,
      ],
    );
    return { operationId, paymentId, reference, sessionId };
  }

  async managerReaderInput(unknownDelaySeconds = 120) {
    const manager = await this.managerFixture();
    return {
      context: await this.staffSessionContext(manager.userId),
      scope: {
        organizationId: manager.organizationId,
        locationId: manager.locationId,
        membershipId: manager.membershipId,
      },
      limit: 21,
      unknownDelaySeconds,
    };
  }

  async list(
    input: Awaited<ReturnType<FinancialAlertTestContext["managerReaderInput"]>>,
  ) {
    return inPostgresTransaction(this.runtimePool, (tx) =>
      queryFinancialAlertCases(tx, input),
    );
  }

  async exact(
    input: {
      context: StaffSessionContext;
      scope: {
        organizationId: string;
        locationId: string;
        membershipId: string;
      };
      unknownDelaySeconds: number;
    },
    seed: CollectionSeed,
    category: FinancialAlertExactReaderInput["category"],
    operationId = seed.operationId,
  ) {
    return inPostgresTransaction(this.runtimePool, (tx) =>
      findFinancialAlertCaseById(tx, {
        context: input.context,
        scope: input.scope,
        unknownDelaySeconds: input.unknownDelaySeconds,
        category,
        sourceId: seed.paymentId,
        episodeId: operationId,
      }),
    );
  }
}
