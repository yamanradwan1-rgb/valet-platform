import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  cashAdjustmentRequestSchema,
  cashReceiptRequestSchema,
  paymentPayerCorrectionRequestSchema,
  paymentServiceAmountCorrectionRequestSchema,
  paymentTipMutationRequestSchema,
  refundRequestSchema,
  validationMutationRequestSchema,
  emptyRequestSchema,
} from "@valet/contracts";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import {
  cashHttpProjection,
  parsePaymentBody,
  parsePaymentUuid,
  paymentHttpProjection,
  staffPaymentProjectionHttp,
  refundHttpProjection,
  resolvePaymentStaffPrincipal,
} from "./payment-http";
import { CashMutationService } from "./cash-mutation.service";
import { PaymentMutationService } from "./payment-mutation.service";
import { PaymentProjectionService } from "./payment-projection.service";
import { RefundService } from "./refund.service";

@Controller("v1/staff/valet-sessions/:sessionId/payment")
export class StaffPaymentController {
  constructor(
    private readonly service: PaymentMutationService,
    private readonly projections: PaymentProjectionService,
    private readonly cash: CashMutationService,
    private readonly refunds: RefundService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

  @Get()
  payment(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Query() query: unknown,
  ) {
    return this.runner.run(
      "PAYMENT_STAFF_PROJECTION_READ",
      request,
      async () => {
        parsePaymentBody(emptyRequestSchema, query ?? {});
        const scope = await this.scope(request, authorization, sessionId);
        return staffPaymentProjectionHttp(
          await this.projections.staff(
            scope.authenticatedUserId,
            scope.valetSessionId,
          ),
        );
      },
    );
  }

  @HttpCode(200)
  @Post("refunds")
  refund(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("PAYMENT_REFUND_CREATE", request, async () =>
      refundHttpProjection(
        await this.refunds.create({
          ...(await this.scope(request, authorization, sessionId)),
          ...parsePaymentBody(refundRequestSchema, body),
        }),
      ),
    );
  }

  @HttpCode(200)
  @Post("cash-receipt")
  cashReceipt(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("PAYMENT_CASH_RECEIVE", request, async () =>
      cashHttpProjection(
        await this.cash.receipt({
          ...(await this.scope(request, authorization, sessionId)),
          ...parsePaymentBody(cashReceiptRequestSchema, body),
        }),
      ),
    );
  }

  @HttpCode(200)
  @Post("cash-adjustments")
  cashAdjustment(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("PAYMENT_CASH_ADJUST", request, async () =>
      cashHttpProjection(
        await this.cash.adjustment({
          ...(await this.scope(request, authorization, sessionId)),
          ...parsePaymentBody(cashAdjustmentRequestSchema, body),
        }),
      ),
    );
  }

  private async scope(
    request: ApiRequest,
    authorization: string | undefined,
    sessionId: string,
  ) {
    return {
      authenticatedUserId: await resolvePaymentStaffPrincipal(
        request,
        authorization,
        this.principals,
      ),
      valetSessionId: parsePaymentUuid(sessionId),
    };
  }

  @Post("validation")
  validation(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("PAYMENT_VALIDATION_MUTATE", request, async () =>
      paymentHttpProjection(
        await this.service.validation({
          ...(await this.scope(request, authorization, sessionId)),
          ...parsePaymentBody(validationMutationRequestSchema, body),
        }),
      ),
    );
  }

  @Patch("tip")
  tip(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("PAYMENT_MANAGER_TIP_UPDATE", request, async () =>
      paymentHttpProjection(
        await this.service.managerTip({
          ...(await this.scope(request, authorization, sessionId)),
          ...parsePaymentBody(paymentTipMutationRequestSchema, body),
        }),
      ),
    );
  }

  @Patch("payer")
  payer(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run("PAYMENT_PAYER_CORRECT", request, async () =>
      paymentHttpProjection(
        await this.service.payer({
          ...(await this.scope(request, authorization, sessionId)),
          ...parsePaymentBody(paymentPayerCorrectionRequestSchema, body),
        }),
      ),
    );
  }

  @Patch("service-amount")
  serviceAmount(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.runner.run(
      "PAYMENT_SERVICE_AMOUNT_CORRECT",
      request,
      async () =>
        paymentHttpProjection(
          await this.service.serviceAmount({
            ...(await this.scope(request, authorization, sessionId)),
            ...parsePaymentBody(
              paymentServiceAmountCorrectionRequestSchema,
              body,
            ),
          }),
        ),
    );
  }
}
