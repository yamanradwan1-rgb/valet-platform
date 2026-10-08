import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { emptyRequestSchema } from "@valet/contracts";

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
import { GuestPushRegistrationService } from "./guest-push-registration.service";
import { parseGuestPushRegistrationRequest } from "./guest-push-registration-types";

function requireEmpty(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value ?? {}).success) {
    throw new ApiTransportValidationError();
  }
}

@Controller("v1/guest/push")
export class GuestPushRegistrationController {
  constructor(
    private readonly service: GuestPushRegistrationService,
    private readonly runner: ApiOperationRunner,
    private readonly authorizer: GuestCredentialAuthorizer,
  ) {}

  @Get("config")
  config(
    @Req() request: ApiRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(guestOperation("GUEST_PUSH_CONFIG_READ"), request, () => {
      requireEmpty(query);
      return this.authorizer.authorize(
        request,
        { mutation: false, requestClass: "A" },
        (reservation, credential) => this.service.config(reservation, credential),
      );
    });
  }

  @Post("registration")
  @HttpCode(204)
  async register(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<void> {
    setNoStoreResponseHeaders(response);
    await this.runner.run(
      guestOperation("GUEST_PUSH_REGISTRATION"),
      request,
      async () => {
        requireEmpty(query);
        const input = parseGuestPushRegistrationRequest(body);
        await this.authorizer.authorize(
          request,
          { mutation: true, requestClass: "B" },
          (reservation, credential) => this.service.register(reservation, credential, input),
        );
      },
    );
  }
}
