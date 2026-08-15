import { UnauthorizedException } from "@nestjs/common";
import {
  cashMutationResponseSchema,
  guestPaymentMutationResponseSchema,
  paymentMutationResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";
import type { StaffPrincipalResolver } from "../auth/staff-principal";
import type { CashMutationProjection } from "./cash-types";
import type { PaymentMutationProjection } from "./payment-mutation-types";

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
