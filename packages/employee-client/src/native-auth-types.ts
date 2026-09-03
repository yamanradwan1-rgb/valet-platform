import type {
  StaffLoginRequest,
  StaffNativeAuthResponse,
} from "@valet/contracts/staff-auth";

export interface SecureRefreshEnvelope {
  readonly installationGeneration: string;
  readonly refreshToken: string;
  readonly version: 1;
}

export interface InstallationAuthState {
  readonly generation: string;
  readonly restoreBlocked: boolean;
  readonly version: 1;
}

export interface SecureRefreshStore {
  delete(): Promise<void>;
  read(): Promise<unknown | null>;
  write(envelope: SecureRefreshEnvelope): Promise<void>;
}

export interface InstallationAuthStateStore {
  read(): Promise<unknown | null>;
  write(state: InstallationAuthState): Promise<void>;
}

export interface NativeStaffAuthTransport {
  login(request: StaffLoginRequest): Promise<StaffNativeAuthResponse>;
  logout(refreshToken: string): Promise<void>;
  refresh(refreshToken: string): Promise<StaffNativeAuthResponse>;
}

export interface IdentityScopedStateBoundary {
  purge(): Promise<void> | void;
}

export type NativeAuthPhase =
  | "authenticated"
  | "fatal"
  | "restoration-unavailable"
  | "restoring"
  | "unauthenticated";

export type NativeAuthReason =
  | "authentication-failed"
  | "configuration-failure"
  | "definitive-auth-loss"
  | "initial"
  | "logged-out"
  | "restore-ineligible"
  | "secure-storage-failure"
  | "transient-failure";

export interface NativeAuthSnapshot {
  readonly accessExpiresAt?: string | undefined;
  readonly authGeneration: number;
  readonly phase: NativeAuthPhase;
  readonly reason?: NativeAuthReason | undefined;
  readonly sessionExpiresAt?: string | undefined;
}

export interface NativeLogoutResult {
  readonly localLogoutComplete: boolean;
  readonly securePurgeConfirmed: boolean;
  readonly serverRevocationConfirmed: boolean;
}

export interface NativeAuthSessionOptions {
  readonly createInstallationGeneration: () => string;
  readonly identityState: IdentityScopedStateBoundary;
  readonly installationState: InstallationAuthStateStore;
  readonly secureRefresh: SecureRefreshStore;
  readonly transport: NativeStaffAuthTransport;
}
