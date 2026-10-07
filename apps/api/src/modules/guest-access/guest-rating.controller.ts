import {
  Body,
  Controller,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  emptyRequestSchema,
  guestRatingSubmissionRequestSchema,
  guestRatingSubmissionResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import { GuestCredentialAuthorizer } from "./guest-credential-authorizer";
import { GuestRatingService } from "./guest-rating.service";

function parseQuery(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value === undefined ? {} : value).success) {
    throw new ApiTransportValidationError();
  }
}

@Controller("v1/guest/session")
export class GuestRatingController {
  constructor(
    private readonly service: GuestRatingService,
    private readonly runner: ApiOperationRunner,
    private readonly authorizer: GuestCredentialAuthorizer,
  ) {}

  @HttpCode(200)
  @Post("rating")
  async submit(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("GUEST_RATING_SUBMIT", request, async () => {
      const parsed = guestRatingSubmissionRequestSchema.safeParse(body);
      if (!parsed.success) throw new ApiTransportValidationError();
      parseQuery(query);
      return guestRatingSubmissionResponseSchema.parse(
        await this.authorizer.authorize(
          request,
          { mutation: true },
          (reservation, credential) =>
            this.service.submit(reservation, credential, parsed.data.rating),
        ),
      );
    });
  }
}
