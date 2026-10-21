import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
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
    setNoStoreResponseHeaders(response);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    await this.runner.run("DASHBOARD_SESSION_PHOTO_BYTES", request, async () => {
      requireSingleManagementAuthorization(request);
      requireNoQueries(query);
      const credential = await this.sessions.resolve(authorization);
      await this.service.deliver({
        credential,
        authenticatedUserId: credential.userId,
        locationId: requireManagementUuid(locationId),
        sessionId: requireManagementUuid(sessionId),
      }, requireManagementUuid(photoId), (bytes,release) => {
        // Callback is invoked synchronously with the final W3 auth and exact
        // AVAILABLE photo rows locked. No await before HTTP bytes are enqueued.
        // Memory budget remains reserved until slow-client write completion or
        // connection abort. Never wait for 'finish' while DB locks are held.
        response.once("finish",release);
        response.once("close",release);
        response.setHeader("Content-Type", "image/jpeg");
        response.setHeader("Content-Length", String(bytes.length));
        response.setHeader("Content-Disposition", "inline");
        response.status(200).end(bytes);
      });
    });
  }
}
