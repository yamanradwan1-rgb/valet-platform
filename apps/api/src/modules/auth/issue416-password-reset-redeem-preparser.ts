import { mapApiError } from "../../common/http/api-errors";
import {
  resolveRequestId,
  type ApiRequest,
} from "../../common/http/api-request";
import { setNoStoreResponseHeaders } from "../../common/http/no-store-response";
import {
  Issue416ResetRateLimitedError,
  Issue416ResetUnavailableError,
} from "./issue416-password-reset-errors";
import { Issue416PasswordResetIngress } from "./issue416-password-reset-redeem-ingress";

interface EarlyResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

/**
 * Only for the exact POST public redeem path, mounted by the app before its
 * body parser. Does not register the route, install itself or enable SQL.
 * Future integration MUST use an exact method-specific Express .post(path)
 * before Nest's body parser. .use(path) matches child paths and would count
 * invalid endpoints. Express .post preserves Nest's default case/trailing
 * slash matching; never rely on raw req.originalUrl string equality.
 */
export function issue416ResetRedeemPreParser(
  ingress: Issue416PasswordResetIngress,
): (
  request: ApiRequest & { readonly method: string },
  response: EarlyResponse,
  next: () => void,
) => void {
  return (request, response, next) => {
    if (request.method !== "POST") {
      next();
      return;
    }
    void ingress.countBeforeBodyParser(request).then(
      () => next(),
      (error: unknown) => {
        const mapped = mapApiError(
          error instanceof Issue416ResetRateLimitedError
            ? error
            : new Issue416ResetUnavailableError(),
        );
        const requestId =
          request.requestId ?? resolveRequestId(request.headers);
        request.requestId = requestId;
        setNoStoreResponseHeaders(response);
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Request-Id", requestId);
        if (mapped.retryAfter !== undefined) {
          response.setHeader("Retry-After", String(mapped.retryAfter));
        }
        response.status(mapped.status).json({
          code: mapped.code,
          message: mapped.message,
          requestId,
        });
      },
    );
  };
}
