import type {
  StaffLoginRequest,
  StaffNativeAuthResponse,
} from "@valet/contracts/staff-auth";

import {
  NativeAuthFailureRecovery,
  NativeAuthGenerationState,
} from "./native-auth-generation";
import { NativeAuthLocalState } from "./native-auth-local-state";
import type {
  InstallationAuthState,
  NativeAuthSessionOptions,
  NativeAuthSnapshot,
  NativeLogoutResult,
  SecureRefreshEnvelope,
} from "./native-auth-types";
import { classifyEmployeeAuthorizationRefreshFailure } from "./recovery-policy";

type RefreshResult =
  "definitive-failure" | "refreshed" | "stale" | "transient-failure";

export class NativeAuthSession {
  private refreshInFlight:
    { generation: number; promise: Promise<RefreshResult> } | undefined;
  private readonly local: NativeAuthLocalState;
  private readonly recovery: NativeAuthFailureRecovery;
  private readonly state = new NativeAuthGenerationState();

  constructor(private readonly options: NativeAuthSessionOptions) {
    this.local = new NativeAuthLocalState(options);
    this.recovery = new NativeAuthFailureRecovery(
      this.state,
      this.local,
      options.transport,
    );
  }

  current(): NativeAuthSnapshot {
    return this.state.current();
  }

  getAccessToken(): string | undefined {
    return this.state.access();
  }

  subscribe(listener: (state: NativeAuthSnapshot) => void): () => void {
    return this.state.subscribe(listener);
  }

  toJSON(): NativeAuthSnapshot {
    return this.state.toJSON();
  }

  async start(): Promise<void> {
    const operationGeneration = this.state.currentGeneration();
    this.state.memory.restoring(operationGeneration);
    let result;
    try {
      result = await this.local.read(this.state.fence(operationGeneration));
    } catch {
      await this.recovery.failFatal(operationGeneration);
      return;
    }
    if (result.status === "stale") return;
    const { envelope, installation, rawEnvelopePresent } = result.value;
    if (installation === undefined) {
      try {
        const established = await this.local.establishBlockedInstallation(
          rawEnvelopePresent,
          this.state.fence(operationGeneration),
        );
        if (established.status === "stale") return;
      } catch {
        await this.recovery.failFatal(operationGeneration);
        return;
      }
      if (!this.state.isCurrent(operationGeneration)) return;
      this.state.memory.unauthenticated(
        operationGeneration,
        rawEnvelopePresent ? "restore-ineligible" : "initial",
      );
      return;
    }
    if (installation.restoreBlocked) {
      const deleted = await this.local.deleteSecure(
        this.state.fence(operationGeneration),
      );
      if (
        deleted.status === "stale" ||
        !this.state.isCurrent(operationGeneration)
      ) {
        return;
      }
      this.state.memory.unauthenticated(operationGeneration, "logged-out");
      return;
    }
    if (!rawEnvelopePresent) {
      if (this.state.isCurrent(operationGeneration)) {
        this.state.memory.unauthenticated(operationGeneration, "initial");
      }
      return;
    }
    if (
      envelope === undefined ||
      envelope.installationGeneration !== installation.generation
    ) {
      await this.recovery.definitiveLoss(
        operationGeneration,
        installation,
        "restore-ineligible",
      );
      return;
    }
    await this.refresh();
  }

  async login(credentials: StaffLoginRequest): Promise<boolean> {
    const operationGeneration = this.state.currentGeneration();
    if (this.current().phase === "authenticated") return false;
    let prepared;
    try {
      prepared = await this.local.prepareLogin(
        this.state.fence(operationGeneration),
      );
    } catch {
      await this.recovery.failFatal(operationGeneration);
      return false;
    }
    if (prepared.status === "stale") return false;
    try {
      const response = await this.options.transport.login(credentials);
      if (!this.state.isCurrent(operationGeneration)) {
        await this.recovery.revokeEphemeral(response.refreshToken);
        return false;
      }
      return (
        (await this.commitResponse(
          response,
          prepared.value,
          operationGeneration,
        )) === "refreshed"
      );
    } catch (error) {
      if (!this.state.isCurrent(operationGeneration)) return false;
      const definitive =
        classifyEmployeeAuthorizationRefreshFailure(error) === "definitive";
      this.state.memory.unauthenticated(
        operationGeneration,
        definitive ? "authentication-failed" : "transient-failure",
      );
      return false;
    }
  }

  refresh(): Promise<RefreshResult> {
    const active = this.refreshInFlight;
    if (active?.generation === this.state.currentGeneration()) {
      return active.promise;
    }
    const operationGeneration = this.state.currentGeneration();
    const promise = this.readAndRefresh(operationGeneration).finally(() => {
      if (this.refreshInFlight?.promise === promise) {
        this.refreshInFlight = undefined;
      }
    });
    this.refreshInFlight = { generation: operationGeneration, promise };
    return promise;
  }

  async logout(): Promise<NativeLogoutResult> {
    const logoutGeneration = this.state.logoutBarrier();
    let cleanup;
    try {
      cleanup = await this.local.logout(this.state.fence(logoutGeneration));
    } catch {
      if (this.state.isCurrent(logoutGeneration)) {
        this.state.memory.fatal(logoutGeneration);
      }
      return this.emptyLogoutResult();
    }
    if (cleanup.status === "stale") return this.emptyLogoutResult();
    return this.recovery.completeLogout(logoutGeneration, cleanup.value);
  }

  async switchAccount(credentials: StaffLoginRequest): Promise<boolean> {
    const logout = await this.logout();
    return logout.localLogoutComplete ? this.login(credentials) : false;
  }

  handleDefinitiveAuthorizationLoss(expectedGeneration: number): Promise<void> {
    return this.recovery.handleDefinitiveAuthorizationLoss(expectedGeneration);
  }

  private async readAndRefresh(
    operationGeneration: number,
  ): Promise<RefreshResult> {
    let result;
    try {
      result = await this.local.read(this.state.fence(operationGeneration));
    } catch {
      if (!this.state.isCurrent(operationGeneration)) return "stale";
      await this.recovery.failFatal(operationGeneration);
      return "definitive-failure";
    }
    if (result.status === "stale") return "stale";
    const { envelope, installation } = result.value;
    if (
      installation === undefined ||
      installation.restoreBlocked ||
      envelope === undefined ||
      envelope.installationGeneration !== installation.generation
    ) {
      return (await this.recovery.definitiveLoss(
        operationGeneration,
        installation,
        "restore-ineligible",
      ))
        ? "definitive-failure"
        : "stale";
    }
    return this.refreshFrom(envelope, installation, operationGeneration);
  }

  private async refreshFrom(
    envelope: SecureRefreshEnvelope,
    installation: InstallationAuthState,
    operationGeneration: number,
  ): Promise<RefreshResult> {
    try {
      const response = await this.options.transport.refresh(
        envelope.refreshToken,
      );
      if (!this.state.isCurrent(operationGeneration)) {
        await this.recovery.revokeEphemeral(response.refreshToken);
        return "stale";
      }
      return this.commitResponse(response, installation, operationGeneration);
    } catch (error) {
      if (!this.state.isCurrent(operationGeneration)) return "stale";
      if (classifyEmployeeAuthorizationRefreshFailure(error) === "definitive") {
        return (await this.recovery.definitiveLoss(
          operationGeneration,
          installation,
          "definitive-auth-loss",
        ))
          ? "definitive-failure"
          : "stale";
      }
      if (this.state.isCurrent(operationGeneration)) {
        this.state.memory.unavailable(operationGeneration);
        return "transient-failure";
      }
      return "stale";
    }
  }

  private async commitResponse(
    response: StaffNativeAuthResponse,
    installation: InstallationAuthState,
    operationGeneration: number,
  ): Promise<RefreshResult> {
    try {
      const committed = await this.local.commitResponse(
        response,
        installation,
        this.state.fence(operationGeneration),
      );
      if (
        committed.status === "stale" ||
        !this.state.isCurrent(operationGeneration)
      ) {
        await this.recovery.revokeEphemeral(response.refreshToken);
        return "stale";
      }
      this.state.memory.authenticated(operationGeneration, response);
      return "refreshed";
    } catch {
      if (!this.state.isCurrent(operationGeneration)) {
        await this.recovery.revokeEphemeral(response.refreshToken);
        return "stale";
      }
      await this.recovery.storageFailure(
        operationGeneration,
        installation,
        response.refreshToken,
      );
      return "definitive-failure";
    }
  }

  private emptyLogoutResult(): NativeLogoutResult {
    return {
      localLogoutComplete: false,
      securePurgeConfirmed: false,
      serverRevocationConfirmed: false,
    };
  }
}
