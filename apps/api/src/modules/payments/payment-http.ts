import { UnauthorizedException } from "@nestjs/common";
import {
  cashMutationResponseSchema,
  guestPaymentMutationResponseSchema,
  guestPaymentProjectionResponseSchema,
  paymentMutationResponseSchema,
  refundResponseSchema,
  staffPaymentProjectionResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";
import type { StaffPrincipalResolver } from "../auth/staff-principal";
import type { CashMutationProjection } from "./cash-types";
import type { PaymentMutationProjection } from "./payment-mutation-types";
import type { SafePaymentProjection } from "./payment-projection-types";
import type { RefundProjection } from "./refund-types";

interface Schema<T> {
  safeParse(
    value: unknown,
  ): { readonly data: T; readonly success: true } | { readonly success: false };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePaymentBody<T>(schema: Schema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

export function parsePaymentUuid(value: string): string {
  if (!uuidPattern.test(value)) throw new ApiTransportValidationError();
  return value;
}

export async function resolvePaymentStaffPrincipal(
  request: ApiRequest,
  authorization: string | undefined,
  principals: StaffPrincipalResolver,
): Promise<string> {
  const headers = request.rawHeaders;
  if (headers === undefined || headers.length % 2 !== 0) {
    throw new UnauthorizedException();
  }
  let count = 0;
  for (let index = 0; index < headers.length; index += 2) {
    if (headers[index]?.toLowerCase() === "authorization") count += 1;
  }
  if (count !== 1) throw new UnauthorizedException();
  return (await principals.resolve(authorization)).userId;
}

export function paymentHttpProjection(projection: PaymentMutationProjection) {
  return paymentMutationResponseSchema.parse({
    ...projection,
    updatedAt: projection.updatedAt.toISOString(),
  });
}

export function guestPaymentHttpProjection(
  projection: PaymentMutationProjection,
) {
  return guestPaymentMutationResponseSchema.parse({
    amountDue: projection.amountDue,
    collectionMethod: projection.collectionMethod,
    currency: projection.currency,
    status: projection.status,
    tipAmount: projection.tipAmount,
    valetSessionId: projection.valetSessionId,
  });
}

export function cashHttpProjection(projection: CashMutationProjection) {
  return cashMutationResponseSchema.parse({
    amountDue: projection.amountDue,
    amountPaid: projection.amountPaid,
    cashEntryAmount: projection.cashEntry.amount,
    cashEntryId: projection.cashEntry.id,
    currency: projection.currency,
    entryType: projection.cashEntry.type,
    occurredAt: projection.cashEntry.occurredAt.toISOString(),
    status: projection.status,
    valetSessionId: projection.valetSessionId,
  });
}

export function refundHttpProjection(projection: RefundProjection) {
  return refundResponseSchema.parse({
    amount: projection.amount,
    completedAt: projection.completedAt?.toISOString() ?? null,
    currency: projection.currency,
    refundId: projection.id,
    requestedAt: projection.requestedAt.toISOString(),
    status: projection.status,
  });
}

function sharedSafeProjection(projection: SafePaymentProjection) {
  return {
    payment:
      projection.payment === null
        ? null
        : {
            amountDue: projection.payment.amountDue,
            amountPaid: projection.payment.amountPaid,
            collectionMethod: projection.payment.collectionMethod,
            currency: projection.payment.currency,
            currentValidation: projection.payment.currentValidation,
            paidAt: projection.payment.paidAt?.toISOString() ?? null,
            serviceAmount: projection.payment.serviceAmount,
            servicePayer: projection.payment.servicePayer,
            status: projection.payment.status,
            tipAmount: projection.payment.tipAmount,
          },
    refunds: projection.refunds.map((refund) => ({
      amount: refund.amount,
      completedAt: refund.completedAt?.toISOString() ?? null,
      requestedAt: refund.requestedAt.toISOString(),
      status: refund.status,
    })),
    releaseRequiresPayment: projection.releaseRequiresPayment,
    releaseSatisfied: projection.releaseSatisfied,
  };
}

export function guestPaymentProjectionHttp(projection: SafePaymentProjection) {
  return guestPaymentProjectionResponseSchema.parse(
    sharedSafeProjection(projection),
  );
}

export function staffPaymentProjectionHttp(projection: SafePaymentProjection) {
  const shared = sharedSafeProjection(projection);
  return staffPaymentProjectionResponseSchema.parse({
    ...shared,
    payment:
      shared.payment === null || projection.payment === null
        ? null
        : {
            ...shared.payment,
            paymentId: projection.payment.paymentId,
            updatedAt: projection.payment.updatedAt.toISOString(),
          },
    refunds: shared.refunds.map((refund, index) => ({
      ...refund,
      refundId: projection.refunds[index]!.refundId,
    })),
  });
}
