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
  guestBrowserPrepareResponseSchema,
  guestBrowserSwitchReconcileResponseSchema,
  guestBrowserSwitchResponseSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import { setNoStoreResponseHeaders } from "../../common/http/no-store-response";
import { AntiAbuseService } from "../anti-abuse/anti-abuse.service";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import { GuestBrowserContextService } from "./guest-browser-context.service";
import { GuestBrowserLimiter } from "./guest-browser-limiter";
import {
  browserContextCookie,
  clearPendingBrowserCookie,
  pendingBrowserCookie,
  readContextPrepareCredentials,
  readContextSwitchCredentials,
  readContextSwitchReconcileCredentials,
} from "./guest-browser-context-transport";
import {
  GuestAuthOriginPolicy,
  browserCookie,
  clearEnrollmentCookie,
  enrollmentCookie,
  requireGuestBrowserMutationTransport,
} from "./guest-browser-transport";

interface CookieResponse {
  setHeader(name: string, value: string | readonly string[]): void;
}

function requireEmpty(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value ?? {}).success) {
    throw new ApiTransportValidationError();
  }
}

@Controller("v1/guest/browser-session")
export class GuestBrowserContextController {
  constructor(
    private readonly contexts: GuestBrowserContextService,
    private readonly runner: ApiOperationRunner,
    private readonly antiAbuse: AntiAbuseService,
    private readonly limiter: GuestBrowserLimiter,
    private readonly originPolicy: GuestAuthOriginPolicy,
  ) {}

  @Post("prepare")
  @HttpCode(200)
  async prepare(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "GUEST_BROWSER_SESSION_PREPARE_CONTEXT",
      request,
      async () => {
        requireEmpty(body);
        requireEmpty(query);
        requireGuestBrowserMutationTransport(request, this.originPolicy);
        if (!this.contexts.enrollmentEnabled()) {
          throw new GuestAccessError("GUEST_ACCESS_INVALID");
        }
        const credentials = readContextPrepareCredentials(request);
        const prepared = await this.limiter.run(
          request,
          credentials?.guestBearer,
          async (transaction, reservation) => {
            if (credentials === undefined) {
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "COUNTED",
              );
              return undefined;
            }
            try {
              const result = await this.contexts.prepareInTransaction(
                transaction,
                credentials.guestBearer,
                credentials.currentBrowserSecret,
              );
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "IGNORED",
              );
              return result;
            } catch (error) {
              if (!(error instanceof GuestAccessError)) throw error;
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "COUNTED",
              );
              return undefined;
            }
          },
        );
        if (prepared === undefined)
          throw new GuestAccessError("GUEST_ACCESS_INVALID");
        if (prepared.kind === "ENROLLMENT_READY") {
          response.setHeader("Set-Cookie", [
            browserCookie(prepared.browserSecret),
            browserContextCookie(prepared.contextMarker),
            enrollmentCookie(prepared.enrollmentSecret),
            clearPendingBrowserCookie(),
          ]);
          return guestBrowserPrepareResponseSchema.parse({
            result: "ENROLLMENT_READY",
          });
        }
        if (prepared.kind === "SAME_VISIT") {
          response.setHeader(
            "Set-Cookie",
            browserContextCookie(prepared.contextMarker),
          );
          return guestBrowserPrepareResponseSchema.parse({
            result: "SAME_VISIT",
          });
        }
        response.setHeader("Set-Cookie", [
          enrollmentCookie(prepared.enrollmentSecret),
          pendingBrowserCookie(prepared.pendingBrowserSecret),
        ]);
        return guestBrowserPrepareResponseSchema.parse({
          currentScope: prepared.currentScope,
          result: "CONTEXT_CONFLICT",
        });
      },
    );
  }

  @Post("switch")
  @HttpCode(200)
  async switchContext(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "GUEST_BROWSER_SESSION_SWITCH_CONTEXT",
      request,
      async () => {
        requireEmpty(body);
        requireEmpty(query);
        requireGuestBrowserMutationTransport(request, this.originPolicy);
        const credentials = readContextSwitchCredentials(request);
        const switched = await this.limiter.run(
          request,
          credentials?.guestBearer,
          async (transaction, reservation) => {
            if (credentials === undefined) {
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "COUNTED",
              );
              return undefined;
            }
            try {
              const result = await this.contexts.switchInTransaction(
                transaction,
                credentials.guestBearer,
                credentials.currentBrowserSecret,
                credentials.enrollmentSecret,
                credentials.pendingBrowserSecret,
              );
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "IGNORED",
              );
              return {
                ...result,
                pendingBrowserSecret: credentials.pendingBrowserSecret,
              };
            } catch (error) {
              if (!(error instanceof GuestAccessError)) throw error;
              await this.antiAbuse.finalizeInTransaction(
                transaction,
                reservation,
                "COUNTED",
              );
              return undefined;
            }
          },
        );
        if (switched === undefined)
          throw new GuestAccessError("GUEST_ACCESS_INVALID");
        response.setHeader("Set-Cookie", [
          browserCookie(switched.pendingBrowserSecret),
          browserContextCookie(switched.contextMarker),
          clearEnrollmentCookie(),
          clearPendingBrowserCookie(),
        ]);
        return guestBrowserSwitchResponseSchema.parse({
          result: switched.kind,
        });
      },
    );
  }

  @Post("switch/reconcile")
  @HttpCode(200)
  async reconcileSwitch(
    @Req() request: ApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    setNoStoreResponseHeaders(response);
    return this.runner.run(
      "GUEST_BROWSER_SESSION_RECONCILE_SWITCH",
      request,
      async () => {
        requireEmpty(body);
        requireEmpty(query);
        requireGuestBrowserMutationTransport(request, this.originPolicy);
        const credentials = readContextSwitchReconcileCredentials(request);
        if (credentials.kind === "INVALID") {
          await this.limiter.reconcileAbsent(request, true);
          throw new GuestAccessError("GUEST_ACCESS_INVALID");
        }
        if (credentials.kind === "NONE") {
          await this.limiter.reconcileAbsent(request, false);
          return guestBrowserSwitchReconcileResponseSchema.parse({
            result: "NONE",
          });
        }
        const reconciled = await this.limiter.run(
          request,
          credentials.currentBrowserSecret,
          async (transaction, reservation) => {
            const result = await this.contexts.reconcileInTransaction(
              transaction,
              credentials.currentBrowserSecret,
              credentials.enrollmentSecret,
              credentials.pendingBrowserSecret,
            );
            await this.antiAbuse.finalizeInTransaction(
              transaction,
              reservation,
              result.kind === "RECOVERED" ? "IGNORED" : "COUNTED",
            );
            return result;
          },
        );
        if (reconciled.kind === "RECOVERED") {
          response.setHeader("Set-Cookie", [
            browserCookie(credentials.pendingBrowserSecret),
            browserContextCookie(reconciled.contextMarker),
            clearEnrollmentCookie(),
            clearPendingBrowserCookie(),
          ]);
          return guestBrowserSwitchReconcileResponseSchema.parse({
            result: "RECOVERED",
          });
        }
        response.setHeader("Set-Cookie", [
          clearEnrollmentCookie(),
          clearPendingBrowserCookie(),
        ]);
        return guestBrowserSwitchReconcileResponseSchema.parse({
          result: "NONE",
        });
      },
    );
  }
}
