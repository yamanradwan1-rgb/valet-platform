import { Inject, Injectable } from "@nestjs/common";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";
import type { HeaderResponse } from "../../common/http/no-store-response";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContext,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { PresenceManagementService } from "./presence-management.service";
import {
  presenceManagementHttpContext,
  presenceLocationHttpTarget,
} from "./presence-management-http";
import type { PresenceManagementTarget } from "./presence-management-authority";

@Injectable()
export abstract class PresenceLocationControllerBase {
  protected abstract readonly authority: PresenceManagementTarget["authority"];
  constructor(
    protected readonly service: PresenceManagementService,
    protected readonly runner: ApiOperationRunner,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    protected readonly sessions: StaffSessionContextResolver,
  ) {}

  protected handle<T>(
    operation: string,
    request: ApiRequest,
    authorization: string | undefined,
    params: Record<string, string>,
    response: HeaderResponse,
    action: (
      context: StaffSessionContext,
      target: PresenceManagementTarget,
    ) => Promise<T>,
  ) {
    return this.runner.run(operation, request, async () => {
      const context = await presenceManagementHttpContext(
        request,
        authorization,
        response,
        this.sessions,
      );
      return action(
        context,
        presenceLocationHttpTarget(this.authority, params),
      );
    });
  }
}
