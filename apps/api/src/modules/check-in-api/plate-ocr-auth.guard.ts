import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../auth/staff-principal";
import { resolveCheckInUserId } from "./check-in-controller-support";
import {
  CheckInOperationRunner,
  type CheckInApiRequest,
} from "./check-in-operation-runner";
import { logPlateOcrBoundary } from "./plate-ocr-boundary-diagnostics";

export interface PlateOcrApiRequest extends CheckInApiRequest {
  plateOcrUserId: string;
}

/** Guards execute before the bounded in-memory multipart interceptor. */
@Injectable()
export class PlateOcrAuthGuard implements CanActivate {
  constructor(
    @Inject(STAFF_PRINCIPAL_RESOLVER)
    private readonly principals: StaffPrincipalResolver,
    private readonly runner: CheckInOperationRunner,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlateOcrApiRequest>();
    const header = request.headers.authorization;
    context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>()
      .setHeader("Cache-Control", "no-store");
    try {
      request.plateOcrUserId = await resolveCheckInUserId(
        this.principals,
        request,
        typeof header === "string" ? header : undefined,
      );
    } catch (error) {
      logPlateOcrBoundary("auth-failure");
      return this.runner.run("CHECK_IN_PLATE_OCR", request, async () => {
        throw error;
      });
    }
    logPlateOcrBoundary("auth-success");
    return true;
  }
}
