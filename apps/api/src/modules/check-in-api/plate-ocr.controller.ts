import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpException,
  HttpCode,
  Post,
  Query,
  Req,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { catchError, type Observable } from "rxjs";
import {
  emptyRequestSchema,
  plateOcrRequestSchema,
  PLATE_OCR_MAX_IMAGE_BYTES,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { parseCheckInBody } from "./check-in-controller-support";
import { CheckInOperationRunner } from "./check-in-operation-runner";
import {
  PlateOcrAuthGuard,
  type PlateOcrApiRequest,
} from "./plate-ocr-auth.guard";
import { logPlateOcrBoundary } from "./plate-ocr-boundary-diagnostics";
import { PlateOcrService } from "./plate-ocr.service";

interface TransientJpeg {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
}

class PlateOcrUploadErrorInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    logPlateOcrBoundary("request-authenticated");
    return next.handle().pipe(
      catchError((error: unknown) => {
        const uploadCode =
          error instanceof Error &&
          "code" in error &&
          typeof error.code === "string" &&
          error.code;
        const payloadTooLarge =
          error instanceof HttpException && error.getStatus() === 413;
        if (uploadCode === "LIMIT_FILE_SIZE" || payloadTooLarge)
          logPlateOcrBoundary("image-size-invalid");
        const uploadLimit =
          typeof uploadCode === "string" && uploadCode.startsWith("LIMIT_");
        if (uploadLimit || payloadTooLarge) {
          throw new BadRequestException();
        }
        throw error;
      }),
    );
  }
}

@Controller("v1/staff/check-in")
export class PlateOcrController {
  constructor(
    private readonly service: PlateOcrService,
    private readonly runner: CheckInOperationRunner,
  ) {}

  @Post("plate-ocr")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseGuards(PlateOcrAuthGuard)
  @UseInterceptors(
    new PlateOcrUploadErrorInterceptor(),
    FileInterceptor("image", {
      limits: {
        fileSize: PLATE_OCR_MAX_IMAGE_BYTES,
        files: 1,
        fields: 2,
        fieldSize: 64,
        parts: 4,
      },
      fileFilter: (_request, file, done) => {
        if (file.mimetype !== "image/jpeg") {
          logPlateOcrBoundary("image-mime-invalid");
          return done(new BadRequestException(), false);
        }
        done(null, true);
      },
    }),
  )
  async recognize(
    @Req() request: PlateOcrApiRequest,
    @Body() body: unknown,
    @Query() query: unknown,
    @UploadedFile() image: TransientJpeg | undefined,
  ) {
    return this.runner.run("CHECK_IN_PLATE_OCR", request, async () => {
      try {
        logPlateOcrBoundary("multipart-accepted");
        parseCheckInBody(emptyRequestSchema, query);
        const input = parseCheckInBody(plateOcrRequestSchema, body);
        logPlateOcrBoundary("metadata-valid");
        if (!image) {
          logPlateOcrBoundary("image-missing");
          throw new ApiTransportValidationError();
        }
        if (image.mimetype !== "image/jpeg") {
          logPlateOcrBoundary("image-mime-invalid");
          throw new ApiTransportValidationError();
        }
        if (image.size > PLATE_OCR_MAX_IMAGE_BYTES) {
          logPlateOcrBoundary("image-size-invalid");
          throw new ApiTransportValidationError();
        }
        if (image.buffer.length !== image.size) {
          logPlateOcrBoundary("image-buffer-size-invalid");
          throw new ApiTransportValidationError();
        }
        if (image.size < 4) {
          logPlateOcrBoundary("image-size-invalid");
          throw new ApiTransportValidationError();
        }
        if (
          image.buffer[0] !== 0xff ||
          image.buffer[1] !== 0xd8 ||
          image.buffer[image.size - 2] !== 0xff ||
          image.buffer[image.size - 1] !== 0xd9
        ) {
          logPlateOcrBoundary("image-jpeg-magic-invalid");
          throw new ApiTransportValidationError();
        }
        logPlateOcrBoundary("controller-to-service");
        return await this.service.recognize(
          request.plateOcrUserId,
          input,
          image.buffer,
        );
      } finally {
        image?.buffer.fill(0);
      }
    });
  }
}
