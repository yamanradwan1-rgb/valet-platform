import { Inject, Injectable } from "@nestjs/common";
import type {
  PaymentPayerCorrectionRequest,
  PaymentServiceAmountCorrectionRequest,
  PaymentTipMutationRequest,
  ValidationMutationRequest,
} from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  AntiAbuseService,
  AntiAbuseUnavailableError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import { GuestAccessService } from "../guest-access/guest-access.service";
import type { GuestCredentialInput } from "../guest-access/guest-credential";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { resolveEffectiveFinancialPolicy } from "./financial-policy-resolver";
import { authorizeManagerFinancialMutation } from "./payment-authorization";
import { FinancialMutationError } from "./payment-mutation-errors";
import { lockCanonicalPayment } from "./payment-mutation-repository";
import {
  correctPayer,
  correctServiceAmount,
  mutateTip,
} from "./payment-term-command";
import {
  inPaymentTransaction,
  loadPaymentOperationTime,
} from "./payment-transaction";
import type {
  FinancialActor,
  PaymentMutationProjection,
  PaymentScope,
} from "./payment-mutation-types";
import { mutateValidation } from "./validation-command";

interface ManagerRequest {
  readonly authenticatedUserId: string;
  readonly valetSessionId: string;
}

type ManagerAction = (
  transaction: PostgresTransaction,
  context: Awaited<ReturnType<PaymentMutationService["managerContext"]>>,
) => Promise<PaymentMutationProjection>;

type GuestResult =
  | { readonly kind: "INVALID_ACCESS" }
  | { readonly error: FinancialMutationError; readonly kind: "MUTATION_ERROR" }
  | {
      readonly kind: "SUCCESS";
      readonly projection: PaymentMutationProjection;
    };

@Injectable()
export class PaymentMutationService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
    private readonly guestAccess: GuestAccessService,
  ) {}

  validation(input: ManagerRequest & ValidationMutationRequest) {
    return this.managerMutation(input, (transaction, context) =>
      mutateValidation(transaction, { ...context, request: input }),
    );
  }

  managerTip(input: ManagerRequest & PaymentTipMutationRequest) {
    return this.managerMutation(input, (transaction, context) =>
      mutateTip(transaction, { ...context, tipAmount: input.tipAmount }),
    );
  }

  payer(input: ManagerRequest & PaymentPayerCorrectionRequest) {
    return this.managerMutation(input, (transaction, context) =>
      correctPayer(transaction, {
        ...context,
        servicePayer: input.servicePayer,
      }),
    );
  }

  serviceAmount(input: ManagerRequest & PaymentServiceAmountCorrectionRequest) {
    return this.managerMutation(input, (transaction, context) =>
      correctServiceAmount(transaction, {
        ...context,
        serviceAmount: input.serviceAmount,
      }),
    );
  }

  async guestTip(
    reservation: AntiAbuseReservation,
    credential: GuestCredentialInput,
    tipAmount: string,
  ): Promise<PaymentMutationProjection> {
    const result = await inPaymentTransaction(this.pool, (transaction) =>
      this.guestTipInTransaction(transaction, reservation, credential, tipAmount),
    );
    if (result.kind === "INVALID_ACCESS") {
      throw new GuestAccessError("GUEST_ACCESS_INVALID");
    }
    if (result.kind === "MUTATION_ERROR") throw result.error;
    return result.projection;
  }

  private managerMutation(input: ManagerRequest, action: ManagerAction) {
    return inPaymentTransaction(this.pool, async (transaction) =>
      action(transaction, await this.managerContext(transaction, input)),
    );
  }

  private async managerContext(
    transaction: PostgresTransaction,
    input: ManagerRequest,
  ) {
    const authorized = await authorizeManagerFinancialMutation(
      transaction,
      input.authenticatedUserId,
      input.valetSessionId,
    );
    return this.mutationContext(
      transaction,
      authorized.scope,
      authorized.actor,
    );
  }

  private async mutationContext(
    transaction: PostgresTransaction,
    scope: PaymentScope,
    actor: FinancialActor,
  ) {
    const payment = await lockCanonicalPayment(transaction, scope);
    const policy = (await resolveEffectiveFinancialPolicy(transaction, scope))
      .policy;
    const operationTime = await loadPaymentOperationTime(transaction);
    return { actor, operationTime, payment, policy };
  }

  private async guestTipInTransaction(
    transaction: PostgresTransaction,
    reservation: AntiAbuseReservation,
    credential: GuestCredentialInput,
    tipAmount: string,
  ): Promise<GuestResult> {
    const resolved = await this.guestAccess.resolveAndLockCredentialInTransaction(
      transaction,
      credential,
    );
    if (resolved === undefined) {
      await this.finalize(transaction, reservation, "COUNTED");
      return { kind: "INVALID_ACCESS" };
    }
    try {
      const context = await this.mutationContext(transaction, resolved.session, {
        actorClass: "GUEST",
        membershipId: null,
      });
      const projection = await mutateTip(transaction, {
        ...context,
        tipAmount,
      });
      await this.finalize(transaction, reservation, "IGNORED");
      return { kind: "SUCCESS", projection };
    } catch (error) {
      if (!(error instanceof FinancialMutationError)) throw error;
      await this.finalize(transaction, reservation, "IGNORED");
      return { error, kind: "MUTATION_ERROR" };
    }
  }

  private async finalize(
    transaction: PostgresTransaction,
    reservation: AntiAbuseReservation,
    state: "COUNTED" | "IGNORED",
  ): Promise<void> {
    try {
      await this.antiAbuse.finalizeInTransaction(
        transaction,
        reservation,
        state,
      );
    } catch {
      throw new AntiAbuseUnavailableError();
    }
  }
}
