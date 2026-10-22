import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import { guestInformationResponseSchema } from "@valet/contracts";

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
import { GuestCredentialAuthorizer } from "./guest-credential-authorizer";
import { GuestInformationService } from "./guest-information.service";

function requestedLocale(query: unknown): "en" | "ar" {
  if (
    query === null ||
    typeof query !== "object" ||
    Array.isArray(query) ||
    Object.keys(query).length !== 1
  ) {
    throw new ApiTransportValidationError();
  }
  const locale = (query as Record<string, unknown>).locale;
  if (locale !== "en" && locale !== "ar") {
    throw new ApiTransportValidationError();
  }
  return locale;
}

@Controller("v1/guest")
export class GuestInformationController {
  constructor(
    private readonly service: GuestInformationService,
    private readonly runner: ApiOperationRunner,
    private readonly authorizer: GuestCredentialAuthorizer,
  ) {}

  @Get("information")
  information(
    @Req() request: ApiRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      guestOperation("GUEST_INFORMATION_READ"),
      request,
      async () => {
        const locale = requestedLocale(query);
        return guestInformationResponseSchema.parse(
          await this.authorizer.authorize(
            request,
            { mutation: false, requestClass: "A" },
            (reservation, credential) =>
              this.service.read(reservation, credential, locale),
          ),
        );
      },
    );
  }
}
