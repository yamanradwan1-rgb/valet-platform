import { TextDecoder } from "node:util";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";
import { rawHeaderValues } from "./guest-browser-transport";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const jsonUtf8Pattern = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;

/**
 * New scoped submissions must not rely on lossy Express UTF-8 JSON parsing:
 * the real bytes must survive the exact Nest rawBody transport.
 *
 * This guard is deliberately route-specific. The legacy stars-only parser,
 * global middleware, other Guest endpoints and source-response shape stay put.
 */
export function requireScopedRatingRawUtf8(request: ApiRequest): void {
  const contentTypes = rawHeaderValues(request, "content-type");
  if (
    contentTypes.length !== 1 ||
    !jsonUtf8Pattern.test(contentTypes[0]!) ||
    !Buffer.isBuffer((request as ApiRequest & { rawBody?: unknown }).rawBody)
  ) {
    throw new ApiTransportValidationError();
  }

  const raw = (request as ApiRequest & { rawBody: Buffer }).rawBody;
  try {
    utf8Decoder.decode(raw);
  } catch {
    // Never include the raw bytes, their repaired characters or driver details.
    throw new ApiTransportValidationError();
  }
}
