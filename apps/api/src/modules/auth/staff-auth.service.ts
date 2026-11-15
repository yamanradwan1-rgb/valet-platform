import { Inject, Injectable } from "@nestjs/common";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { STAFF_AUTH_WRITER_POOL } from "../../common/database/staff-auth-writer-database.module";
import type { AntiAbuseReservation } from "../anti-abuse/anti-abuse.service";
import { issueStaffLogin } from "./staff-auth-login-command";
import { rotateStaffRefresh } from "./staff-auth-refresh-command";
import { logoutStaffSession } from "./staff-auth-logout";
import type { StaffAuthTokens, StaffPasswordVerifier } from "./staff-auth-types";

export { StaffAuthenticationError } from "./staff-auth-types";
export type { StaffAuthTokens, StaffPasswordVerifier } from "./staff-auth-types";
export {
  Argon2StaffPasswordVerifier,
  isAcceptedStaffPasswordHash,
  STAFF_AUTH_DUMMY_PASSWORD_HASH,
} from "./staff-password-verification";
export { DatabaseStaffPrincipalResolver } from "./staff-session-context";

export const STAFF_PASSWORD_VERIFIER = Symbol("STAFF_PASSWORD_VERIFIER");

@Injectable()
export class StaffAuthService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_PASSWORD_VERIFIER)
    private readonly passwordVerifier: StaffPasswordVerifier,
    @Inject(STAFF_AUTH_WRITER_POOL) private readonly writer: PostgresPool,
  ) {}

  login(
    email: string,
    password: string,
    identifierReservation?: AntiAbuseReservation,
  ): Promise<StaffAuthTokens> {
    return issueStaffLogin(
      this.pool, this.writer, this.passwordVerifier,
      email, password, identifierReservation,
    );
  }

  refresh(refreshToken: string): Promise<StaffAuthTokens> {
    return rotateStaffRefresh(this.pool, this.writer, refreshToken);
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return logoutStaffSession(this.writer, refreshToken);
  }
}
