import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Logger,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import {
  setNoStoreResponseHeaders,
  type HeaderResponse,
} from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  requireManagementUuid,
  requireSingleManagementAuthorization,
} from "../management/staff-management-http";
import { DashboardSessionPhotoService } from "./session-photo-service";

interface PhotoBytesResponse extends HeaderResponse {
  readonly closed?: boolean;
  readonly destroyed: boolean;
  readonly headersSent: boolean;
  readonly writableEnded: boolean;
  readonly writableFinished?: boolean;
  destroy(): void;
  status(value: number): PhotoBytesResponse;
  end(body: Buffer): void;
  once(event: "finish" | "close", listener: () => void): void;
}

function requireNoQueries(query: unknown): void {
  if (query === null || typeof query !== "object" ||
      Array.isArray(query) || Object.keys(query).length !== 0)
    throw new ApiTransportValidationError();
}

@Controller("v1/staff/dashboard/locations/:locationId/sessions/:sessionId/condition-photos")
export class DashboardSessionPhotoController {
  private readonly logger = new Logger(DashboardSessionPhotoController.name);

  constructor(
    private readonly service: DashboardSessionPhotoService,
    private readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  manifest(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("sessionId") sessionId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    setNoStoreResponseHeaders(response);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return this.runner.run("DASHBOARD_SESSION_PHOTO_MANIFEST", request, async () => {
      requireSingleManagementAuthorization(request);
      requireNoQueries(query);
      const credential = await this.sessions.resolve(authorization);
      return await this.service.list({
        credential,
        authenticatedUserId: credential.userId,
        locationId: requireManagementUuid(locationId),
        sessionId: requireManagementUuid(sessionId),
      });
    });
  }

  @Get(":photoId/bytes")
  async bytes(
    @Req() request: ApiRequest,
    @Headers("authorization") authorization: string | undefined,
    @Param("locationId") locationId: string,
    @Param("sessionId") sessionId: string,
    @Param("photoId") photoId: string,
    @Query() query: unknown,
    @Res() response: PhotoBytesResponse,
  ): Promise<void> {
    // Register before any awaited auth/DB/S3 work. A client may disconnect
    // during readExact(), long before deliverSync is called.
    let closed = response.destroyed || response.closed === true;
    let finished = response.writableFinished === true;
    let closedBeforeFinish = closed && !finished;
    let enqueued = false;
    let released = false;
    let releaseAfterEnqueue: (() => void) | undefined;
    const releaseOnce = () => {
      if (!enqueued || released || releaseAfterEnqueue === undefined) return;
      released = true;
      releaseAfterEnqueue();
    };
    response.once("close", () => {
      if (!finished) closedBeforeFinish = true;
      closed = true;
      releaseOnce();
    });
    response.once("finish", () => {
      finished = true;
      releaseOnce();
    });
    const cannotWrite = () =>
      closed || response.destroyed || response.closed === true ||
      response.writableEnded;

    setNoStoreResponseHeaders(response);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      await this.runner.run("DASHBOARD_SESSION_PHOTO_BYTES", request, async () => {
        if (cannotWrite()) throw new Error("Photo response is no longer writable.");
        requireSingleManagementAuthorization(request);
        requireNoQueries(query);
        const credential = await this.sessions.resolve(authorization);
        await this.service.deliver({
          credential,
          authenticatedUserId: credential.userId,
          locationId: requireManagementUuid(locationId),
          sessionId: requireManagementUuid(sessionId),
        }, requireManagementUuid(photoId), (bytes, release) => {
          // Called synchronously with final W3 auth and AVAILABLE evidence
          // locked; never await network flush in the database transaction.
          // The transport might already have closed during async S3 I/O.
          // Throwing makes the service's !queued finally release its admission.
          if (cannotWrite()) throw new Error("Photo response is no longer writable.");
          response.setHeader("Content-Type", "image/jpeg");
          response.setHeader("Content-Length", String(bytes.length));
          response.setHeader("Content-Disposition", "inline");
          // A real Node ServerResponse can be destroyed reentrantly inside a
          // header/status setter. Never even call end() on that connection.
          if (cannotWrite()) throw new Error("Photo response closed before enqueue.");
          response.status(200);
          if (cannotWrite()) throw new Error("Photo response closed before enqueue.");
          response.end(bytes);
          // A close can occur synchronously during setHeader/status/end.
          // Node may silently discard end() on a destroyed connection; do
          // not mark such a response SUCCESS or retain its reservation.
          // 'finish' then 'close' can occur synchronously in normal Node
          // responses. The inverse order is abort, and a destroyed socket
          // with no close event yet also represents a silently lost end().
          if (closedBeforeFinish ||
              ((closed || response.closed === true) && !finished) ||
              (response.destroyed && !closed))
            throw new Error("Photo response closed before write completion.");
          // Node may emit finish/close synchronously inside end(), or it may
          // already have closed. Retain the release only for successful enqueue.
          releaseAfterEnqueue = release;
          enqueued = true;
          if (closed || finished || response.destroyed ||
              response.writableFinished === true)
            releaseOnce();
        });
      });
    } catch (error) {
      // The runner has already recorded ERROR. After a synchronous end() the
      // HTTP status is immutable, so Nest cannot send a second JSON error.
      if (closed || response.destroyed || response.closed === true) {
        this.logger.error(
          `PHOTO_BYTES_ERROR_AFTER_CLOSE requestId=${request.requestId ?? "unavailable"}`,
        );
        return;
      }
      if (response.writableEnded) {
        this.logger.error(
          `PHOTO_BYTES_ERROR_AFTER_RESPONSE requestId=${request.requestId ?? "unavailable"}`,
        );
        return;
      }
      // If only headers reached the socket, a second JSON write is equally
      // unsafe. Abort the incomplete response so a slow client cannot hang.
      if (response.headersSent) {
        this.logger.error(
          `PHOTO_BYTES_ERROR_AFTER_HEADERS requestId=${request.requestId ?? "unavailable"}`,
        );
        response.destroy();
        return;
      }
      // Until a response starts, preserve normal runner/error-filter behavior.
      throw error;
    }
  }
}
