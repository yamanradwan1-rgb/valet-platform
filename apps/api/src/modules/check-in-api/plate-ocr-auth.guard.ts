import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContext,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import { resolveCheckInUserId } from "./check-in-controller-support";
import {
  CheckInOperationRunner,
  type CheckInApiRequest,
} from "./check-in-operation-runner";
import { logPlateOcrBoundary } from "./plate-ocr-boundary-diagnostics";
import { ownPlateOcrRequestCancellation } from "./plate-ocr-request-cancellation";

export interface PlateOcrApiRequest extends CheckInApiRequest {
  plateOcrUserId: string;
  plateOcrSession: StaffSessionContext;
  plateOcrSignal: AbortSignal;
}

/** Guards execute before the bounded in-memory multipart interceptor. */
@Injectable()
export class PlateOcrAuthGuard implements CanActivate {
  constructor(
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
    private readonly runner: CheckInOperationRunner,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlateOcrApiRequest>();
    const header = request.headers.authorization;
    const response = context.switchToHttp().getResponse<ServerResponse>();
    response.setHeader("Cache-Control", "no-store");
    try {
      request.plateOcrUserId = await resolveCheckInUserId(
        {
          resolve: async (authorization) => {
            const session = await this.sessions.resolve(authorization);
            request.plateOcrSession = session;
            return { userId: session.userId };
          },
        },
        request,
        typeof header === "string" ? header : undefined,
      );
    } catch (error) {
      logPlateOcrBoundary("auth-failure");
      return this.runner.run("CHECK_IN_PLATE_OCR", request, async () => {
        throw error;
      });
    }
    request.plateOcrSignal = ownPlateOcrRequestCancellation(
      request as unknown as IncomingMessage,
      response,
    );
    logPlateOcrBoundary("auth-success");
    return true;
  }
}
