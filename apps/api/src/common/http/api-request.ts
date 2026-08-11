import { randomUUID } from "node:crypto";

import { Injectable, type NestMiddleware } from "@nestjs/common";

export interface ApiRequest {
  operationMeasured?: boolean;
  requestId?: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawHeaders?: readonly string[];
  readonly socket?: { readonly remoteAddress?: string };
}

const requestIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveRequestId(headers: ApiRequest["headers"]): string {
  const candidate = headers["x-request-id"];
  return typeof candidate === "string" && requestIdPattern.test(candidate)
    ? candidate
    : randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: ApiRequest,
    response: { setHeader(name: string, value: string): void },
    next: () => void,
  ): void {
    const requestId = resolveRequestId(request.headers);
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  }
}
