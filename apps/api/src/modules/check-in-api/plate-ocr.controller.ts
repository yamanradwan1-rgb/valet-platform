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
    return next.handle().pipe(
      catchError((error: unknown) => {
        const uploadLimit =
          error instanceof Error &&
          "code" in error &&
          typeof error.code === "string" &&
          error.code.startsWith("LIMIT_");
        if (
          uploadLimit ||
          (error instanceof HttpException && error.getStatus() === 413)
        ) {
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
        if (file.mimetype !== "image/jpeg")
          return done(new BadRequestException(), false);
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
        parseCheckInBody(emptyRequestSchema, query);
        const input = parseCheckInBody(plateOcrRequestSchema, body);
        if (
          !image ||
          image.mimetype !== "image/jpeg" ||
          image.size > PLATE_OCR_MAX_IMAGE_BYTES ||
          image.buffer.length !== image.size ||
          image.size < 4 ||
          image.buffer[0] !== 0xff ||
          image.buffer[1] !== 0xd8 ||
          image.buffer[image.size - 2] !== 0xff ||
          image.buffer[image.size - 1] !== 0xd9
        ) {
          throw new ApiTransportValidationError();
        }
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
