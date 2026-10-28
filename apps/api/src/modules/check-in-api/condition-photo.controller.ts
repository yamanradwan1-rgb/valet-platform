import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  conditionPhotoOperationParamsSchema,
  conditionPhotoReconcileRequestSchema,
  conditionPhotoSessionParamsSchema,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ConditionPhotoBackendService } from "../vehicle-photos/condition-photo-backend.service";
import {
  ConditionPhotoAuthGuard,
  type ConditionPhotoApiRequest,
} from "./condition-photo-auth.guard";
import { parseConditionPhotoMultipart } from "./condition-photo-multipart";
import { acquireConditionPhotoIngress } from "./condition-photo-ingress";
import { CheckInOperationRunner } from "./check-in-operation-runner";

interface MutableResponse {
  status(code: number): MutableResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  once(event: "close", listener: () => void): void;
  off(event: "close", listener: () => void): void;
}

function validSession(sessionId: string) {
  const result = conditionPhotoSessionParamsSchema.safeParse({ sessionId });
  if (!result.success) throw new ApiTransportValidationError();
  return result.data.sessionId;
}

function validOperation(sessionId: string, operationId: string) {
  const result = conditionPhotoOperationParamsSchema.safeParse({
    sessionId,
    operationId,
  });
  if (!result.success) throw new ApiTransportValidationError();
  return result.data;
}

function credential(request: ConditionPhotoApiRequest) {
  const context = request.conditionPhotoCredential;
  if (!context) throw new ApiTransportValidationError();
  return context;
}

function noBody(request: ConditionPhotoApiRequest) {
  const contentLength = request.headers["content-length"];
  const transferEncoding = request.headers["transfer-encoding"];
  if (
    (contentLength !== undefined && contentLength !== "0") ||
    transferEncoding !== undefined
  )
    throw new ApiTransportValidationError();
}

@Controller("v1/staff/check-in")
@UseGuards(ConditionPhotoAuthGuard)
export class ConditionPhotoController {
  constructor(
    private readonly backend: ConditionPhotoBackendService,
    private readonly runner: CheckInOperationRunner,
  ) {}

  @Post("sessions/:sessionId/condition-photo-uploads")
  async upload(
    @Req() request: ConditionPhotoApiRequest,
    @Param("sessionId") sessionIdRaw: string,
    @Res() response: MutableResponse,
  ): Promise<void> {
    response.setHeader("Cache-Control", "no-store");
    const result = await this.runner.run(
      "CHECK_IN_CONDITION_PHOTO_UPLOAD",
      request,
      async () => {
        const sessionId = validSession(sessionIdRaw);
        const releaseIngress = acquireConditionPhotoIngress();
        const cancellation = new AbortController();
        const disconnect = () => cancellation.abort();
        response.once("close", disconnect);
        try {
          const photo = await parseConditionPhotoMultipart(request);
          try {
            return await this.backend.upload(
              credential(request),
              sessionId,
              photo.clientOperationId,
              photo.imageBytes,
              cancellation.signal,
            );
          } finally {
            photo.imageBytes.fill(0);
          }
        } finally {
          response.off("close", disconnect);
          releaseIngress();
        }
      },
    );
    response
      .status(
        result.status.status === "PENDING" ? 202 : result.newCommit ? 201 : 200,
      )
      .json(result.status);
  }

  @Get("sessions/:sessionId/condition-photo-uploads/:operationId")
  async status(
    @Req() request: ConditionPhotoApiRequest,
    @Param("sessionId") sessionIdRaw: string,
    @Param("operationId") operationIdRaw: string,
  ) {
    return await this.runner.run(
      "CHECK_IN_CONDITION_PHOTO_STATUS",
      request,
      async () => {
        noBody(request);
        const { sessionId, operationId } = validOperation(
          sessionIdRaw,
          operationIdRaw,
        );
        const status = await this.backend.status(
          credential(request),
          sessionId,
          operationId,
        );
        if (!status) throw new ConditionPhotoNotFound();
        return status;
      },
    );
  }

  @Post("sessions/:sessionId/condition-photo-uploads/:operationId/reconcile")
  @HttpCode(200)
  async reconcile(
    @Req() request: ConditionPhotoApiRequest,
    @Param("sessionId") sessionIdRaw: string,
    @Param("operationId") operationIdRaw: string,
    @Body() body: unknown,
    @Res() response: MutableResponse,
  ): Promise<void> {
    response.setHeader("Cache-Control", "no-store");
    const status = await this.runner.run(
      "CHECK_IN_CONDITION_PHOTO_RECONCILE",
      request,
      async () => {
        const { sessionId, operationId } = validOperation(
          sessionIdRaw,
          operationIdRaw,
        );
        if (!conditionPhotoReconcileRequestSchema.safeParse(body ?? {}).success)
          throw new ApiTransportValidationError();
        return await this.backend.reconcile(
          credential(request),
          sessionId,
          operationId,
        );
      },
    );
    response.status(status.status === "PENDING" ? 202 : 200).json(status);
  }

  @Get("sessions/:sessionId/condition-photo-state")
  async discovery(
    @Req() request: ConditionPhotoApiRequest,
    @Param("sessionId") sessionIdRaw: string,
  ) {
    return await this.runner.run(
      "CHECK_IN_CONDITION_PHOTO_STATE",
      request,
      async () => {
        noBody(request);
        return await this.backend.discovery(
          credential(request),
          validSession(sessionIdRaw),
        );
      },
    );
  }
}

class ConditionPhotoNotFound extends Error {
  readonly code = "CONDITION_PHOTO_NOT_FOUND";
  constructor() {
    super("The requested photo operation is not available.");
  }
}
