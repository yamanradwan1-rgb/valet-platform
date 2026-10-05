import type {
  StaffLoginRequest,
  StaffNativeAuthResponse,
} from "@valet/contracts/staff-auth";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { NativeAuthSession } from "./native-auth-session";
import type {
  InstallationAuthState,
  InstallationAuthStateStore,
  NativeStaffAuthTransport,
  SecureRefreshEnvelope,
  SecureRefreshStore,
} from "./native-auth-types";

export const generation = "installation-generation-0001";
export const access0 = `vsa1.${"a".repeat(43)}`;
export const access1 = `vsa1.${"b".repeat(43)}`;
export const accessB = `vsa1.${"e".repeat(43)}`;
export const accessBRestored = `vsa1.${"g".repeat(43)}`;
export const refresh0 = `vsr1.${"c".repeat(43)}`;
export const refresh1 = `vsr1.${"d".repeat(43)}`;
export const refreshB = `vsr1.${"f".repeat(43)}`;
export const refreshBRestored = `vsr1.${"h".repeat(43)}`;

export function response(
  accessToken = access1,
  refreshToken = refresh1,
): StaffNativeAuthResponse {
  return {
    accessExpiresAt: "2026-09-03T12:15:00.000Z",
    accessToken,
    refreshToken,
    sessionExpiresAt: "2026-10-03T12:00:00.000Z",
    tokenType: "Bearer",
  };
}

export class MemorySecureRefresh implements SecureRefreshStore {
  deleteGate: Promise<void> | undefined;
  deleteFailure = false;
  deleteStarted: (() => void) | undefined;
  readGate: Promise<void> | undefined;
  readFailure = false;
  readStarted: (() => void) | undefined;
  value: unknown | null = null;
  writeFailure = false;
  writeGate: Promise<void> | undefined;
  writeStarted: (() => void) | undefined;

  async delete(): Promise<void> {
    this.deleteStarted?.();
    if (this.deleteGate !== undefined) await this.deleteGate;
    if (this.deleteFailure) throw new Error("secure delete unavailable");
    this.value = null;
  }

  async read(): Promise<unknown | null> {
    this.readStarted?.();
    if (this.readGate !== undefined) await this.readGate;
    if (this.readFailure) throw new Error("secure read unavailable");
    return this.value;
  }

  async write(envelope: SecureRefreshEnvelope): Promise<void> {
    if (this.writeFailure) throw new Error("secure write unavailable");
    this.writeStarted?.();
    if (this.writeGate !== undefined) await this.writeGate;
    this.value = envelope;
  }
}

export class MemoryInstallationState implements InstallationAuthStateStore {
  failWriteAt: number | null = null;
  readFailure = false;
  value: unknown | null = null;
  writeCalls = 0;
  writeFailure = false;
  writeGate: Promise<void> | undefined;
  writeStarted: (() => void) | undefined;

  async read(): Promise<unknown | null> {
    if (this.readFailure) throw new Error("installation read unavailable");
    return this.value;
  }

  async write(state: InstallationAuthState): Promise<void> {
    this.writeCalls += 1;
    if (this.writeFailure || this.failWriteAt === this.writeCalls)
      throw new Error("installation write unavailable");
    this.writeStarted?.();
    if (this.writeGate !== undefined) await this.writeGate;
    this.value = state;
  }
}

export class StubNativeAuthTransport implements NativeStaffAuthTransport {
  loginCalls: StaffLoginRequest[] = [];
  loginResult: Promise<StaffNativeAuthResponse> = Promise.resolve(response());
  loginStarted: (() => void) | undefined;
  logoutCalls: string[] = [];
  logoutFailure = false;
  refreshCalls: string[] = [];
  refreshResult: Promise<StaffNativeAuthResponse> = Promise.resolve(response());
  refreshStarted: (() => void) | undefined;

  async login(request: StaffLoginRequest): Promise<StaffNativeAuthResponse> {
    this.loginCalls.push(request);
    this.loginStarted?.();
    return this.loginResult;
  }

  async logout(refreshToken: string): Promise<void> {
    this.logoutCalls.push(refreshToken);
    if (this.logoutFailure) throw employeeNetworkError();
  }

  async refresh(refreshToken: string): Promise<StaffNativeAuthResponse> {
    this.refreshCalls.push(refreshToken);
    this.refreshStarted?.();
    return this.refreshResult;
  }
}

export function authenticatedStorage(
  secure: MemorySecureRefresh,
  installation: MemoryInstallationState,
): void {
  installation.value = { generation, restoreBlocked: false, version: 1 };
  secure.value = {
    installationGeneration: generation,
    refreshToken: refresh0,
    version: 1,
  };
}

export function authFailure(): EmployeeApiError {
  return new EmployeeApiError({
    code: "STAFF_AUTHENTICATION_FAILED",
    message: "Staff authentication failed.",
    status: 401,
  });
}

export function deferred<T>(): {
  promise: Promise<T>;
  reject(error: unknown): void;
  resolve(value: T): void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject(error) {
      rejectPromise?.(error);
    },
    resolve(value) {
      resolvePromise?.(value);
    },
  };
}

export function createTestSession(
  secure: MemorySecureRefresh,
  installation: MemoryInstallationState,
  transport: StubNativeAuthTransport,
  purges: number[] = [],
): NativeAuthSession {
  return new NativeAuthSession({
    createInstallationGeneration: () => generation,
    identityState: { purge: () => void purges.push(purges.length + 1) },
    installationState: installation,
    secureRefresh: secure,
    transport,
  });
}

export function fixture() {
  const secure = new MemorySecureRefresh();
  const installation = new MemoryInstallationState();
  const transport = new StubNativeAuthTransport();
  const purges: number[] = [];
  const session = createTestSession(secure, installation, transport, purges);
  return { installation, purges, secure, session, transport };
}
