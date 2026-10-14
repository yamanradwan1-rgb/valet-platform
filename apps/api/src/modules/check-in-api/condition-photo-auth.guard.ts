import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import {
  conditionPhotoSessionParamsSchema,
  conditionPhotoNoQuerySchema,
} from "@valet/contracts";

import type { IncomingMessage } from "node:http";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { ConditionPhotoAdmission } from "../vehicle-photos/condition-photo-admission";
import { ConditionPhotoBackendService } from "../vehicle-photos/condition-photo-backend.service";
import { CheckInOperationRunner, type CheckInApiRequest } from "./check-in-operation-runner";

export type ConditionPhotoApiRequest = CheckInApiRequest & IncomingMessage & {
  readonly params: { readonly sessionId?: string };
  readonly query: Record<string, unknown>;
  conditionPhotoCredential?: StaffSessionContext;
  conditionPhotoSessionId?: string;
};

function exactlyOneAuthorization(request: CheckInApiRequest): string {
  const headers = request.rawHeaders;
  if (headers === undefined || headers.length % 2 !== 0)
    throw new UnauthorizedException();
  let count = 0;
  for (let index = 0; index < headers.length; index += 2)
    if (headers[index]?.toLowerCase() === "authorization") count += 1;
  const header = request.headers.authorization;
  if (count !== 1 || typeof header !== "string") throw new UnauthorizedException();
  return header;
}

class PhotoRateLimitError extends Error {
  readonly code = "CONDITION_PHOTO_RATE_LIMITED";
  constructor(readonly retryAfter: number) {
    super("Too many photo requests. Try again later.");
  }
}

/** Pre-parser authority and shared admission: no image bytes accepted first. */
@Injectable()
export class ConditionPhotoAuthGuard implements CanActivate {
  constructor(
    private readonly backend: ConditionPhotoBackendService,
    private readonly admission: ConditionPhotoAdmission,
    private readonly runner: CheckInOperationRunner,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ConditionPhotoApiRequest>();
    context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>()
      .setHeader("Cache-Control", "no-store");
    try {
      const params = conditionPhotoSessionParamsSchema.safeParse({
        sessionId: request.params.sessionId,
      });
      if (!params.success || !conditionPhotoNoQuerySchema.safeParse(request.query).success)
        throw new ApiTransportValidationError();
      const authorization = exactlyOneAuthorization(request);
      const current = await this.backend.authorize(authorization, params.data.sessionId);
      request.conditionPhotoCredential = current.credential;
      request.conditionPhotoSessionId = params.data.sessionId;

      const path = request.url?.split("?", 1)[0] ?? "";
      const upload = request.method === "POST" && path.endsWith("/condition-photo-uploads");
      const reconcile = request.method === "POST" && path.endsWith("/reconcile");
      const read = await this.admission.statusRead(current.credential.userId);
      if (!read.allowed) throw new PhotoRateLimitError(read.retryAfter);
      if (upload || reconcile) {
        const write = await this.admission.uploadStart(
          current.credential.userId,
          params.data.sessionId,
        );
        if (!write.allowed) throw new PhotoRateLimitError(write.retryAfter);
      }
      return true;
    } catch (error) {
      // Mapping through the shared runner preserves bounded request IDs,
      // telemetry and no-store error handling for guard-time failures.
      await this.runner.run("CHECK_IN_CONDITION_PHOTO_AUTH", request, async () => {
        throw error;
      });
      return false;
    }
  }
}
