import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { emptyRequestSchema, guestSafeSessionResponseSchema } from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import {
  AntiAbuseRateLimitError,
  AntiAbuseService,
  AntiAbuseUnavailableError,
} from "../anti-abuse/anti-abuse.service";
import {
  ClientAddressUnavailableError,
  TrustedClientAddressResolver,
} from "../anti-abuse/client-address";
import { shapeValidGuestBearer } from "../guest-access/guest-access-bearer";
import { GuestAccessService } from "../guest-access/guest-access.service";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { CustodyMutationError } from "../valet-sessions/protected-custody-command";
import { RequestRetrievalService } from "./request-retrieval.service";

function requireEmpty(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value).success) {
    throw new ApiTransportValidationError();
  }
}

@Controller("v1/guest/session")
export class GuestRetrievalController {
  constructor(
    private readonly retrieval: RequestRetrievalService,
    private readonly guestAccess: GuestAccessService,
    private readonly antiAbuse: AntiAbuseService,
    private readonly clientAddresses: TrustedClientAddressResolver,
    private readonly runner: ApiOperationRunner,
  ) {}

  @HttpCode(200)
  @Post("request-retrieval")
  async requestRetrieval(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run("GUEST_RETRIEVAL_REQUEST", request, async () => {
      requireEmpty(body);
      requireEmpty(query ?? {});

      let clientAddress: string;
      try {
        clientAddress = this.clientAddresses.resolve(request);
      } catch (error) {
        if (error instanceof ClientAddressUnavailableError) {
          throw new AntiAbuseUnavailableError();
        }
        throw error;
      }

      const addressKey = this.antiAbuse.key(
        "v1:guest-client-address",
        clientAddress,
      );
      const rawToken = shapeValidGuestBearer(request, authorization);
      const tokenKey =
        rawToken === undefined
          ? undefined
          : this.antiAbuse.key("v1:guest-token", rawToken);
      const addressDecision = await this.antiAbuse.reserve(addressKey, 60);

      if (!addressDecision.allowed) {
        const tokenRetry =
          tokenKey === undefined
            ? undefined
            : await this.antiAbuse.blocker(tokenKey, 180);
        throw new AntiAbuseRateLimitError(
          "GUEST_ACCESS_RATE_LIMITED",
          Math.max(addressDecision.retryAfter, tokenRetry ?? 0),
        );
      }

      if (tokenKey !== undefined) {
        const tokenDecision = await this.antiAbuse.count(tokenKey, 180);
        if (!tokenDecision.allowed) {
          await this.antiAbuse.finalize(addressDecision.reservation, "IGNORED");
          throw new AntiAbuseRateLimitError(
            "GUEST_ACCESS_RATE_LIMITED",
            tokenDecision.retryAfter,
          );
        }
      }

      if (rawToken === undefined) {
        await this.antiAbuse.finalize(addressDecision.reservation, "COUNTED");
        throw new GuestAccessError("GUEST_ACCESS_INVALID");
      }

      const outcome = await this.antiAbuse.transaction(async (transaction) => {
        const guest = await this.guestAccess.resolveInTransaction(
          transaction,
          rawToken,
        );
        if (guest === undefined) {
          await this.antiAbuse.finalizeInTransaction(
            transaction,
            addressDecision.reservation,
            "COUNTED",
          );
          return { kind: "INVALID_GUEST" as const };
        }

        const result = await this.retrieval.executeInTransaction(
          transaction,
          guest.valetSessionId,
        );
        await this.antiAbuse.finalizeInTransaction(
          transaction,
          addressDecision.reservation,
          "IGNORED",
        );
        return result;
      });

      if (outcome.kind === "INVALID_GUEST") {
        throw new GuestAccessError("GUEST_ACCESS_INVALID");
      }
      if (outcome.kind === "INVALID_STATE") {
        throw new CustodyMutationError("INVALID_STATE_TRANSITION");
      }
      return guestSafeSessionResponseSchema.parse(outcome.session);
    });
  }
}
