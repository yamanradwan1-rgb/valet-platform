import { Injectable } from "@nestjs/common";

import type { ApiRequest } from "../../common/http/api-request";
import type { PostgresTransaction } from "../../common/database/postgres";
import {
  AntiAbuseService,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import { GuestRequestAdmission } from "./guest-request-admission";
import {
  readBrowserCookie,
  hasInvalidBrowserCookieTarget,
} from "./guest-browser-transport";
import type { GuestCredential } from "./guest-credential";

export type BrowserAdmissionCredentials =
  | string
  | undefined
  | {
      readonly primary?: string | undefined;
      readonly recovery: readonly string[];
    };

export function browserAdmissionCredentials(
  primary: string | undefined,
  ...recovery: readonly (string | undefined)[]
): BrowserAdmissionCredentials {
  return {
    primary,
    recovery: recovery.filter(
      (secret): secret is string => secret !== undefined,
    ),
  };
}

@Injectable()
export class GuestBrowserLimiter {
  constructor(
    private readonly antiAbuse: AntiAbuseService,
    private readonly admission: GuestRequestAdmission,
  ) {}

  async reconcileAbsent(request: ApiRequest, invalid: boolean): Promise<void> {
    await this.run(
      request,
      undefined,
      (transaction, reservation) =>
        this.antiAbuse.finalizeInTransaction(
          transaction,
          reservation,
          invalid || hasInvalidBrowserCookieTarget(request)
            ? "COUNTED"
            : "IGNORED",
        ),
      !invalid,
    );
  }

  async run<T>(
    request: ApiRequest,
    credentials: BrowserAdmissionCredentials,
    operation: (
      transaction: PostgresTransaction,
      reservation: AntiAbuseReservation,
    ) => Promise<T>,
    allocation = false,
  ): Promise<T> {
    const browser = readBrowserCookie(request);
    const credentialSecret =
      typeof credentials === "object" ? credentials.primary : credentials;
    const recovery =
      typeof credentials === "object" ? credentials.recovery : [];
    const alternates: GuestCredential[] = [
      ...recovery,
      ...(browser === undefined ? [] : [browser]),
    ].map((secret) => ({ kind: "BROWSER_SESSION", secret }));
    const credential: GuestCredential | undefined =
      credentialSecret === undefined
        ? browser === undefined
          ? undefined
          : { kind: "BROWSER_SESSION", secret: browser }
        : {
            kind: credentialSecret.startsWith("vgb1.")
              ? "BROWSER_SESSION"
              : "LEGACY_BEARER",
            secret: credentialSecret,
          };
    const reservation = allocation
      ? await this.admission.allocation(request, credential)
      : await this.admission.admit(request, credential, "B", alternates);
    return this.antiAbuse.transaction((transaction) =>
      operation(transaction, reservation),
    );
  }
}
