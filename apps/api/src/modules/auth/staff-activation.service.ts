import { Inject, Injectable } from "@nestjs/common";
import {
  staffPasswordCreationSchema,
  type StaffActivationRequest,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { STAFF_AUTH_WRITER_POOL } from "../../common/database/staff-auth-writer-database.module";
import { staffAuthWriterTransaction } from "./staff-auth-writer-transaction";
import type { ApiRequest } from "../../common/http/api-request";
import {
  AntiAbuseService,
  AntiAbuseUnavailableError,
  AntiAbuseRateLimitError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import {
  TrustedClientAddressResolver,
  ClientAddressUnavailableError,
} from "../anti-abuse/client-address";
import { staffInvitationHash } from "../management/staff-invitation-credential";
import { signS04StaffActivationSuccess } from "../anti-abuse/s04-signed-sql-proof";
import { hashStaffPassword } from "./staff-password-hashing";
import {
  Argon2StaffPasswordVerifier,
  isAcceptedStaffPasswordHash,
  STAFF_AUTH_DUMMY_PASSWORD_HASH,
} from "./staff-password-verification";
import {
  activateStaffInvitation,
  loadActivationAccount,
  StaffActivationFailedError,
  verifyCommittedStaffActivation,
} from "./staff-activation-repository";

export const STAFF_ACTIVATION_CREDENTIAL_LIMIT = 5;
export const STAFF_ACTIVATION_ADDRESS_LIMIT = 30;

@Injectable()
export class StaffActivationService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_AUTH_WRITER_POOL) private readonly writer: PostgresPool,
    private readonly antiAbuse: AntiAbuseService,
    private readonly addresses: TrustedClientAddressResolver,
    private readonly verifier: Argon2StaffPasswordVerifier,
  ) {}

  async activate(body: StaffActivationRequest, request: ApiRequest) {
    let address: string;
    try {
      address = this.addresses.resolve(request);
    } catch (error) {
      if (error instanceof ClientAddressUnavailableError)
        throw new AntiAbuseUnavailableError();
      throw error;
    }
    const reservations: AntiAbuseReservation[] = [];
    const addressDecision = await this.antiAbuse.reserve(
      this.antiAbuse.key("v1:staff-activation-client-address", address),
      STAFF_ACTIVATION_ADDRESS_LIMIT,
    );
    if (!addressDecision.allowed)
      throw new AntiAbuseRateLimitError(
        "STAFF_ACTIVATION_RATE_LIMITED",
        addressDecision.retryAfter,
      );
    reservations.push(addressDecision.reservation);
    try {
      const credential = await this.antiAbuse.reserve(
        this.antiAbuse.key("v1:staff-activation-credential", body.inviteToken),
        STAFF_ACTIVATION_CREDENTIAL_LIMIT,
      );
      if (!credential.allowed) {
        await this.antiAbuse.finalize(addressDecision.reservation, "IGNORED");
        reservations.length = 0;
        throw new AntiAbuseRateLimitError(
          "STAFF_ACTIVATION_RATE_LIMITED",
          credential.retryAfter,
        );
      }
      reservations.push(credential.reservation);
      const tokenHash = staffInvitationHash(body.inviteToken);
      const account = await loadActivationAccount(this.pool, tokenHash);
      let verifiedHash: string | null = null;
      let newHash: string | null = null;
      if (
        account?.status === "PENDING" &&
        account.password_hash === null &&
        staffPasswordCreationSchema.safeParse(body.password).success
      ) {
        newHash = await hashStaffPassword(body.password);
      } else {
        const supported =
          account?.password_hash != null &&
          isAcceptedStaffPasswordHash(account.password_hash);
        const matches = await this.verifier.verify(
          supported ? account!.password_hash! : STAFF_AUTH_DUMMY_PASSWORD_HASH,
          body.password,
        );
        if (account?.status === "ACTIVE" && supported && matches)
          verifiedHash = account.password_hash;
        else throw new StaffActivationFailedError();
      }
      return await staffAuthWriterTransaction(this.writer, async (transaction) => {
        const result = await activateStaffInvitation(
          transaction,
          tokenHash,
          verifiedHash,
          newHash,
        );
        const transactionIdentity = await transaction.query<{ xid: string }>(
          "SELECT pg_catalog.pg_current_xact_id()::text AS xid",
        );
        const transactionId = transactionIdentity.rows[0]?.xid;
        if (transactionIdentity.rowCount !== 1 || !transactionId) {
          throw new AntiAbuseUnavailableError();
        }
        for (const reservation of reservations) {
          if (!reservation.id) throw new AntiAbuseUnavailableError();
          const proof = signS04StaffActivationSuccess(
            reservation.id,
            reservation.key,
            tokenHash,
            transactionId,
          );
          const settled = await transaction.query<{ affected: number }>(
            `SELECT public.s04_staff_activation_success(
               $1::uuid,$2::text,$3::text,$4::text,$5::xid8,$6::uuid,$7::bigint,$8::text
             ) AS affected`,
            [reservation.id, reservation.key.scope,
              reservation.key.keyHash, tokenHash,
              transactionId, proof.nonce, proof.expiresMs, proof.mac],
          );
          if (settled.rows[0]?.affected !== 1)
            throw new AntiAbuseUnavailableError();
        }
        return result;
      }, async () => verifyCommittedStaffActivation(
        this.pool, tokenHash, verifiedHash, newHash, reservations,
      ));
    } catch (error) {
      for (const reservation of reservations)
        await this.antiAbuse.finalize(reservation, "COUNTED");
      throw error;
    }
  }
}
