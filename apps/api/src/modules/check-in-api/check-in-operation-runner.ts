import { Injectable } from "@nestjs/common";

import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import type { ApiRequest } from "../../common/http/api-request";

export interface CheckInRequestMeasurementState {
  checkInElapsedMs?: number;
}

export type CheckInApiRequest = ApiRequest & CheckInRequestMeasurementState;

@Injectable()
export class CheckInOperationRunner {
  constructor(private readonly runner: ApiOperationRunner) {}

  async run<T>(
    operation: string,
    request: CheckInApiRequest,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.runner.run(operation, request, action, () =>
      request.checkInElapsedMs === undefined
        ? {}
        : { checkInElapsedMs: request.checkInElapsedMs },
    );
  }
}
