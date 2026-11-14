import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { ApiRequest } from "../../common/http/api-request";
import { ApiOperationRunner } from "../../common/http/api-operation-runner";
import {
  setPrivateAuthHeaders,
  type AuthResponse,
} from "./staff-auth.transport";
import { Issue416PasswordResetRedeemService } from "./issue416-password-reset-redeem.service";

/**
 * Dormant pending a dedicated pre-JSON-parser ingress mount, actual private
 * SQL writer and independently tested ACL+atomicity. No AuthModule registration.
 */
@Controller("v1/staff/auth/password-resets")
export class Issue416PasswordResetRedeemController {
  constructor(
    private readonly service: Issue416PasswordResetRedeemService,
    private readonly runner: ApiOperationRunner,
  ) {}

  @Post("redeem")
  @HttpCode(200)
  redeem(
    @Req() request: ApiRequest,
    @Headers("origin") origin: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Query() query: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: AuthResponse,
  ) {
    setPrivateAuthHeaders(response);
    response.setHeader("Referrer-Policy", "no-referrer");
    return this.runner.run("STAFF_PASSWORD_RESET_REDEEM", request, () =>
      this.service.redeem(request, origin, contentType, query, body),
    );
  }
}
