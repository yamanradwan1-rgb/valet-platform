import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  emptyRequestSchema,
  paymentTipMutationRequestSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import {
  ApiOperationRunner,
  guestOperation,
} from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import { GuestCredentialAuthorizer } from "../guest-access/guest-credential-authorizer";
import {
  guestPaymentHttpProjection,
  guestPaymentProjectionHttp,
  parsePaymentBody,
  parsePaymentUuid,
} from "./payment-http";
import { PaymentMutationService } from "./payment-mutation.service";
import { PaymentProjectionService } from "./payment-projection.service";

@Controller("v1/guest")
export class GuestPaymentController {
  constructor(
    private readonly service: PaymentMutationService,
    private readonly projections: PaymentProjectionService,
    private readonly runner: ApiOperationRunner,
    private readonly authorizer: GuestCredentialAuthorizer,
  ) {}

  @Patch("payment/tip")
  tip(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      guestOperation("PAYMENT_GUEST_TIP_UPDATE"),
      request,
      async () => {
        if (!emptyRequestSchema.safeParse(query ?? {}).success) {
          throw new ApiTransportValidationError();
        }
        const input = parsePaymentBody(paymentTipMutationRequestSchema, body);
        return guestPaymentHttpProjection(
          await this.authorizer.authorize(
            request,
            { mutation: true },
            (reservation, credential) =>
              this.service.guestTip(reservation, credential, input.tipAmount),
          ),
        );
      },
    );
  }

  @Get("valet-sessions/:sessionId/payment")
  payment(
    @Req() request: ApiRequest,
    @Param("sessionId") sessionId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      guestOperation("PAYMENT_GUEST_PROJECTION_READ"),
      request,
      async () => {
        if (!emptyRequestSchema.safeParse(query ?? {}).success) {
          throw new ApiTransportValidationError();
        }
        const targetSessionId = parsePaymentUuid(sessionId);
        return guestPaymentProjectionHttp(
          await this.authorizer.authorize(
            request,
            { mutation: false },
            (reservation, credential) =>
              this.projections.guest(reservation, credential, targetSessionId),
          ),
        );
      },
    );
  }
}
