import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  paymentPayerCorrectionRequestSchema,
  paymentServiceAmountCorrectionRequestSchema,
  paymentTipMutationRequestSchema,
  validationMutationRequestSchema,
} from "@valet/contracts";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import {
  parsePaymentBody,
  parsePaymentUuid,
  paymentHttpProjection,
  resolvePaymentStaffPrincipal,
} from "./payment-http";
import { PaymentMutationService } from "./payment-mutation.service";

@Controller("v1/staff/valet-sessions/:sessionId/payment")
export class StaffPaymentController {
  constructor(
    private readonly service: PaymentMutationService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
  ) {}

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
