import { createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";

import type { ApiRequest } from "../../../common/http/api-request";
import {
  ClientAddressUnavailableError,
  TrustedClientAddressResolver,
} from "../../anti-abuse/client-address";
import { AntiAbuseUnavailableError } from "../../anti-abuse/anti-abuse.service";

const DOMAIN = Buffer.from("VAYLET/A01/REQUEST-FINGERPRINT/v1\0", "ascii");
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

function appendBounded(hmac: ReturnType<typeof createHmac>, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length === 0 || bytes.length > 1024) {
    throw new AntiAbuseUnavailableError();
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  hmac.update(length).update(bytes);
}

/**
 * The HTTP request owner supplies the original socket, never a claimed IP,
 * fingerprint or signing callback. The existing server-only anti-abuse secret
 * is used with an independent fixed HMAC domain; the VAP1 proof root remains
 * separately held and never participates in this reservation fingerprint.
 * SQL-only callers cannot synthesize another trusted request fingerprint.
 */
@Injectable()
export class Issue416A01RequestFingerprint {
  constructor(private readonly addresses: TrustedClientAddressResolver) {}

  derive(
    request: ApiRequest,
    normalizedEmail: string,
    operationId: string,
    reservationId: string,
    identifierKeyHash: string,
  ): Buffer {
    try {
      if (
        !UUID.test(operationId) || !UUID.test(reservationId) ||
        !/^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$/.test(identifierKeyHash)
      ) throw new AntiAbuseUnavailableError();
      const canonicalAddress = this.addresses.resolve(request);
      const secretB64 = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
      if (typeof secretB64 !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(secretB64)) {
        throw new AntiAbuseUnavailableError();
      }
      const root = Buffer.from(secretB64, "base64url");
      try {
        if (root.length !== 32 || root.toString("base64url") !== secretB64) {
          throw new AntiAbuseUnavailableError();
        }
        const hmac = createHmac("sha256", root).update(DOMAIN);
        for (const field of [
          canonicalAddress, normalizedEmail, operationId,
          reservationId, identifierKeyHash,
        ]) appendBounded(hmac, field);
        return hmac.digest();
      } finally {
        root.fill(0);
      }
    } catch (error) {
      if (error instanceof ClientAddressUnavailableError ||
          error instanceof AntiAbuseUnavailableError) {
        throw new AntiAbuseUnavailableError();
      }
      throw new AntiAbuseUnavailableError();
    }
  }
}
