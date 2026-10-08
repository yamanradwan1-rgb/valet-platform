import { GuestRequestAdmission } from "./guest-request-admission";
import type { GuestRequestClass } from "./guest-request-policy";
import { Injectable } from "@nestjs/common";

import type { ApiRequest } from "../../common/http/api-request";
import {
  AntiAbuseService,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import { GuestAccessError } from "../valet-sessions/guest-access-command";
import {
  GuestAuthOriginPolicy,
  readGuestCredential,
  requireGuestBrowserMutationTransport,
} from "./guest-browser-transport";
import type { GuestCredential } from "./guest-credential";

@Injectable()
export class GuestCredentialAuthorizer {
  constructor(
    private readonly antiAbuse: AntiAbuseService,
    private readonly originPolicy: GuestAuthOriginPolicy,
    private readonly admission: GuestRequestAdmission,
  ) {}

  async read(request: ApiRequest) {
    const credential = readGuestCredential(request);
    if (credential !== undefined) {
      const admitted = await this.antiAbuse.transaction((transaction) =>
        this.admission.authenticatedInTransaction(
          transaction,
          request,
          credential,
          "A",
        ),
      );
      if (admitted !== undefined) return admitted.resolved.session;
    }
    const reservation = await this.admission.unknown(
      request,
      credential?.secret,
    );
    await this.antiAbuse.finalize(reservation, "COUNTED");
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }

  async authorize<T>(
    request: ApiRequest,
    options: {
      readonly mutation: boolean;
      readonly requestClass?: GuestRequestClass;
    },
    operation: (
      reservation: AntiAbuseReservation,
      credential: GuestCredential,
    ) => Promise<T>,
  ): Promise<T> {
    const credential = readGuestCredential(request);
    if (credential?.kind === "BROWSER_SESSION" && options.mutation) {
      requireGuestBrowserMutationTransport(request, this.originPolicy);
    }

    const reservation = await this.admission.admit(
      request,
      credential,
      options.requestClass ?? (options.mutation ? "C" : "A"),
    );
    if (credential === undefined) {
      await this.antiAbuse.finalize(reservation, "COUNTED");
      throw new GuestAccessError("GUEST_ACCESS_INVALID");
    }
    return operation(reservation, credential);
  }
}
