import type { IncomingMessage } from "node:http";

import Busboy from "busboy";
import { conditionPhotoUploadFieldsSchema } from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";

const maxBytes = 8 * 1024 * 1024;
const maxWireBytes = maxBytes + 16 * 1024;
const multipartContentType = new RegExp(
  String.raw`^multipart/form-data\s*;\s*boundary=[A-Za-z0-9'()+_,./:=?-]{1,70}$`,
  "i",
);

export class ConditionPhotoMultipartError extends Error {
  constructor(readonly code: "CONDITION_PHOTO_TOO_LARGE" | "CONDITION_PHOTO_INVALID_IMAGE") {
    super("The uploaded condition photo was rejected.");
  }
}

export interface ParsedConditionPhotoMultipart {
  readonly clientOperationId: string;
  readonly imageBytes: Buffer;
}

/** Runs only after the Staff auth/scope/anti-abuse guard. */
export async function parseConditionPhotoMultipart(
  request: IncomingMessage,
): Promise<ParsedConditionPhotoMultipart> {
  const rawType = request.headers["content-type"];
  if (typeof rawType !== "string" ||
      !multipartContentType.test(rawType))
    throw new ApiTransportValidationError();
  const declared = request.headers["content-length"];
  if (declared !== undefined) {
    if (typeof declared !== "string" || !/^\d{1,10}$/.test(declared))
      throw new ApiTransportValidationError();
    if (Number(declared) > maxWireBytes)
      throw new ConditionPhotoMultipartError("CONDITION_PHOTO_TOO_LARGE");
  }

  return await new Promise((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: request.headers,
        limits: {
          fieldNameSize: 64,
          fieldSize: 64,
          fields: 1,
          files: 1,
          // Busboy can signal the terminal boundary after the second part.
          // Exact part names/count are validated separately in handlers.
          parts: 3,
          fileSize: maxBytes,
          headerPairs: 16,
        },
      });
    } catch {
      reject(new ApiTransportValidationError());
      return;
    }
    let completed = false;
    let rawSize = 0;
    let imageBytes = 0;
    let operationId: string | undefined;
    let fileCount = 0;
    let fieldCount = 0;
    const chunks: Buffer[] = [];
    const deadline = setTimeout(() =>
      fail(new ConditionPhotoMultipartError("CONDITION_PHOTO_TOO_LARGE")), 60_000);
    function cleanup() {
      clearTimeout(deadline);
      request.off("data", countWireBytes);
      request.off("aborted", aborted);
    }
    function fail(error: Error) {
      if (completed) return;
      completed = true;
      cleanup();
      request.unpipe(parser);
      request.pause();
      // Busboy emits file/parts limits while its parser is still processing a
      // chunk. Destroying it in that callback invalidates its active file state.
      // Stop ingress synchronously, then destroy after the callback returns.
      queueMicrotask(() => parser.destroy());
      // Keep the socket alive long enough for Nest to serialize the
      // contract error (400/413); do not drain an unbounded hostile body.
      // The HTTP response must close the connection after its final byte.
      request.socket?.setKeepAlive(false);
      (request as IncomingMessage & { res?: { setHeader(key: string, value: string): void } })
        .res?.setHeader("Connection", "close");
      reject(error);
    }
    function aborted() { fail(new ApiTransportValidationError()); }
    function countWireBytes(chunk: Buffer) {
      rawSize += chunk.length;
      if (rawSize > maxWireBytes)
        fail(new ConditionPhotoMultipartError("CONDITION_PHOTO_TOO_LARGE"));
    }
    request.on("data", countWireBytes);
    request.once("aborted", aborted);

    parser.on("field", (name, value, info) => {
      fieldCount += 1;
      if (fieldCount + fileCount > 2)
        return fail(new ApiTransportValidationError());
      if (name !== "operationId" || fieldCount !== 1 ||
          info.nameTruncated || info.valueTruncated)
        return fail(new ApiTransportValidationError());
      operationId = value;
    });
    parser.on("file", (name, stream, info) => {
      // Busboy may emit a secondary stream error when its parent parser is
      // destroyed on a size/parts limit; never leave that error unhandled.
      stream.on("error", () => {
        if (!completed) fail(new ApiTransportValidationError());
      });
      fileCount += 1;
      if (fieldCount + fileCount > 2)
        return fail(new ApiTransportValidationError());
      if (name !== "image" || fileCount !== 1 ||
          info.mimeType !== "image/jpeg" ||
          Buffer.byteLength(info.filename ?? "", "utf8") > 128)
        return fail(new ApiTransportValidationError());
      stream.on("limit", () =>
        fail(new ConditionPhotoMultipartError("CONDITION_PHOTO_TOO_LARGE")));
      stream.on("data", (chunk: Buffer) => {
        imageBytes += chunk.length;
        if (imageBytes > maxBytes)
          return fail(new ConditionPhotoMultipartError("CONDITION_PHOTO_TOO_LARGE"));
        chunks.push(chunk);
      });
    });
    for (const event of ["partsLimit", "filesLimit", "fieldsLimit"] as const)
      parser.on(event, () => fail(new ApiTransportValidationError()));
    parser.on("error", () => fail(new ApiTransportValidationError()));
    parser.on("close", () => {
      if (completed) return;
      completed = true;
      cleanup();
      const parsed = conditionPhotoUploadFieldsSchema.safeParse({ operationId });
      if (fileCount !== 1 || fieldCount !== 1 || imageBytes === 0 ||
          !parsed.success)
        return reject(new ApiTransportValidationError());
      resolve({ clientOperationId: parsed.data.operationId,
        imageBytes: Buffer.concat(chunks, imageBytes) });
    });
    request.pipe(parser);
  });
}
