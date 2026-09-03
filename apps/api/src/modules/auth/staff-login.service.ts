import { Injectable } from "@nestjs/common";
import type { StaffLoginRequest } from "@valet/contracts";

import type { ApiRequest } from "../../common/http/api-request";
import {
  AntiAbuseRateLimitError,
  AntiAbuseService,
  AntiAbuseUnavailableError,
} from "../anti-abuse/anti-abuse.service";
import {
  ClientAddressUnavailableError,
  TrustedClientAddressResolver,
} from "../anti-abuse/client-address";
import { StaffAuthService, type StaffAuthTokens } from "./staff-auth.service";

@Injectable()
export class StaffLoginService {
  constructor(
    private readonly authService: StaffAuthService,
    private readonly antiAbuse: AntiAbuseService,
    private readonly clientAddresses: TrustedClientAddressResolver,
  ) {}

  async login(
    body: StaffLoginRequest,
    request: ApiRequest,
  ): Promise<StaffAuthTokens> {
    let clientAddress: string;
    try {
      clientAddress = this.clientAddresses.resolve(request);
    } catch (error) {
      if (error instanceof ClientAddressUnavailableError) {
        throw new AntiAbuseUnavailableError();
      }
      throw error;
    }
    const addressKey = this.antiAbuse.key(
      "v1:staff-client-address",
      clientAddress,
    );
    const identifierKey = this.antiAbuse.key(
      "v1:staff-login-identifier",
      body.email,
    );
    const addressDecision = await this.antiAbuse.count(addressKey, 30);
    if (!addressDecision.allowed) {
      const identifierRetry = await this.antiAbuse.blocker(identifierKey, 5);
      throw new AntiAbuseRateLimitError(
        "STAFF_AUTHENTICATION_RATE_LIMITED",
        Math.max(addressDecision.retryAfter, identifierRetry ?? 0),
      );
    }
    const identifierDecision = await this.antiAbuse.reserve(identifierKey, 5);
    if (!identifierDecision.allowed) {
      const addressRetry = await this.antiAbuse.blocker(addressKey, 30);
      throw new AntiAbuseRateLimitError(
        "STAFF_AUTHENTICATION_RATE_LIMITED",
        Math.max(identifierDecision.retryAfter, addressRetry ?? 0),
      );
    }
    try {
      return await this.authService.login(
        body.email,
        body.password,
        identifierDecision.reservation,
      );
    } catch (error) {
      await this.antiAbuse.finalize(identifierDecision.reservation, "COUNTED");
      throw error;
    }
  }
}
