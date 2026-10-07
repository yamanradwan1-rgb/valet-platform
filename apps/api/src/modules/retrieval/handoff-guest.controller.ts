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
  guestHandoffMaterialResponseSchema,
  issueHandoffVerificationRequestSchema,
  type IssueHandoffVerificationRequest,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import { GuestCredentialAuthorizer } from "../guest-access/guest-credential-authorizer";
import { HandoffService } from "./handoff.service";

function parseBody(value: unknown): IssueHandoffVerificationRequest {
  const parsed = issueHandoffVerificationRequestSchema.safeParse(value);
  if (!parsed.success) throw new ApiTransportValidationError();
  return parsed.data;
}

function parseQuery(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value ?? {}).success) {
    throw new ApiTransportValidationError();
  }
}

@Controller("v1/guest/session/handoff-verification")
export class HandoffGuestController {
  constructor(
    private readonly service: HandoffService,
    private readonly runner: ApiOperationRunner,
    private readonly authorizer: GuestCredentialAuthorizer,
  ) {}

  private async execute(
    request: ApiRequest,
    body: unknown,
    query: unknown,
    rotate: boolean,
  ) {
    const input = parseBody(body);
    parseQuery(query);
    return guestHandoffMaterialResponseSchema.parse(
      await this.authorizer.authorize(
        request,
        { mutation: true },
        (reservation, credential) =>
          this.service.issueGuestMaterial(
            reservation,
            credential,
            input.method,
            rotate,
          ),
      ),
    );
  }

  @HttpCode(200)
  @Post("issue")
  issue(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("ISSUE_HANDOFF_VERIFICATION", request, () =>
      this.execute(request, body, query, false),
    );
  }

  @HttpCode(200)
  @Post("rotate")
  rotate(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("ROTATE_HANDOFF_VERIFICATION", request, () =>
      this.execute(request, body, query, true),
    );
  }
}
