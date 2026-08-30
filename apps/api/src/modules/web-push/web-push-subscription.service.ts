import { Inject, Injectable } from "@nestjs/common";
import type {
  WebPushSubscriptionRequest,
  WebPushSubscriptionResponse,
} from "@valet/contracts";
import type { WebPushServerConfig } from "@valet/config";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  AntiAbuseService,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import {
  lockGuestSubscriptionAuthority,
  lockStaffSubscriptionAuthority,
  type WebPushSubscriptionAuthority,
} from "./web-push-subscription-authority";
import { WebPushSubscriptionRepository } from "./web-push-subscription-repository";
import { WEB_PUSH_SERVER_CONFIG } from "./web-push-subscription.tokens";

type AuthorityResolver = (
  transaction: PostgresTransaction,
) => Promise<WebPushSubscriptionAuthority>;

@Injectable()
export class WebPushSubscriptionService {
  private readonly subscriptions: WebPushSubscriptionRepository;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(WEB_PUSH_SERVER_CONFIG) config: WebPushServerConfig,
    private readonly antiAbuse: AntiAbuseService,
  ) {
    this.subscriptions = new WebPushSubscriptionRepository(config);
  }

  staffSubscribe(authorization: string, input: WebPushSubscriptionRequest) {
    return this.mutate(input, (transaction) =>
      lockStaffSubscriptionAuthority(transaction, authorization),
    );
  }

  staffReplace(
    authorization: string,
    subscriptionId: string,
    input: WebPushSubscriptionRequest,
  ) {
    return this.mutate(
      input,
      (transaction) =>
        lockStaffSubscriptionAuthority(transaction, authorization),
      subscriptionId,
    );
  }

  staffUnsubscribe(authorization: string, subscriptionId: string) {
    return this.disable(subscriptionId, (transaction) =>
      lockStaffSubscriptionAuthority(transaction, authorization),
    );
  }

  guestSubscribe(
    reservation: AntiAbuseReservation,
    rawToken: string,
    input: WebPushSubscriptionRequest,
  ) {
    return this.guestOperation(
      reservation,
      rawToken,
      (transaction, authority) =>
        this.subscriptions.mutate(transaction, input, authority),
    );
  }

  guestReplace(
    reservation: AntiAbuseReservation,
    rawToken: string,
    subscriptionId: string,
    input: WebPushSubscriptionRequest,
  ) {
    return this.guestOperation(
      reservation,
      rawToken,
      (transaction, authority) =>
        this.subscriptions.mutate(
          transaction,
          input,
          authority,
          subscriptionId,
        ),
    );
  }

  guestUnsubscribe(
    reservation: AntiAbuseReservation,
    rawToken: string,
    subscriptionId: string,
  ) {
    return this.guestOperation(
      reservation,
      rawToken,
      (transaction, authority) =>
        this.subscriptions.disable(transaction, subscriptionId, authority),
    );
  }

  private mutate(
    input: WebPushSubscriptionRequest,
    resolveAuthority: AuthorityResolver,
    subscriptionId?: string,
  ) {
    return inPostgresTransaction(this.pool, async (transaction) =>
      this.subscriptions.mutate(
        transaction,
        input,
        await resolveAuthority(transaction),
        subscriptionId,
      ),
    );
  }

  private disable(subscriptionId: string, resolveAuthority: AuthorityResolver) {
    return inPostgresTransaction(this.pool, async (transaction) =>
      this.subscriptions.disable(
        transaction,
        subscriptionId,
        await resolveAuthority(transaction),
      ),
    );
  }

  private async guestOperation(
    reservation: AntiAbuseReservation,
    rawToken: string,
    operation: (
      transaction: PostgresTransaction,
      authority: WebPushSubscriptionAuthority,
    ) => Promise<WebPushSubscriptionResponse>,
  ): Promise<WebPushSubscriptionResponse> {
    let authenticated = false;
    try {
      return await inPostgresTransaction(this.pool, async (transaction) => {
        const authority = await lockGuestSubscriptionAuthority(
          transaction,
          rawToken,
        );
        authenticated = true;
        const result = await operation(transaction, authority);
        await this.antiAbuse.finalizeInTransaction(
          transaction,
          reservation,
          "IGNORED",
        );
        return result;
      });
    } catch (error) {
      await this.antiAbuse.finalize(
        reservation,
        authenticated ? "IGNORED" : "COUNTED",
      );
      throw error;
    }
  }
}
