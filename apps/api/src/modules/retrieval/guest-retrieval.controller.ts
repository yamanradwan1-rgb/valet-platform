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
  guestSafeSessionResponseSchema,
} from "@valet/contracts";

import type { ApiRequest } from "../../common/http/api-request";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import {
  ApiOperationRunner,
  guestOperation,
} from "../../common/http/api-operation-runner";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import { GuestCredentialAuthorizer } from "../guest-access/guest-credential-authorizer";
import { RetrievalService } from "./retrieval.service";

function parseEmptyBody(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value === undefined ? {} : value).success) {
    throw new ApiTransportValidationError();
  }
}

function parseEmptyQuery(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value === undefined ? {} : value).success) {
    throw new ApiTransportValidationError();
  }
}

@Controller("v1/guest/session")
export class GuestRetrievalController {
  constructor(
    private readonly service: RetrievalService,
    private readonly runner: ApiOperationRunner,
    private readonly authorizer: GuestCredentialAuthorizer,
  ) {}

  @HttpCode(200)
  @Post("request-retrieval")
  async requestRetrieval(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      guestOperation("GUEST_RETRIEVAL_REQUEST"),
      request,
      async () => {
        parseEmptyBody(body);
        parseEmptyQuery(query);
        return guestSafeSessionResponseSchema.parse(
          await this.authorizer.authorize(
            request,
            { mutation: true },
            (reservation, credential) =>
              this.service.requestGuestRetrieval(reservation, credential),
          ),
        );
      },
    );
  }

  @HttpCode(200)
  @Post("cancel-retrieval")
  async cancelRetrieval(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      guestOperation("GUEST_RETRIEVAL_CANCEL"),
      request,
      async () => {
        parseEmptyBody(body);
        parseEmptyQuery(query);
        return guestSafeSessionResponseSchema.parse(
          await this.authorizer.authorize(
            request,
            { mutation: true },
            (reservation, credential) =>
              this.service.cancelGuestRetrieval(reservation, credential),
          ),
        );
      },
    );
  }
}
