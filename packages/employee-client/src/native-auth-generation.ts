import {
  NativeAuthLocalState,
  type LocalLogoutCleanup,
} from "./native-auth-local-state";
import { NativeAuthMemoryState } from "./native-auth-memory";
import type {
  InstallationAuthState,
  NativeAuthReason,
  NativeAuthSessionOptions,
  NativeAuthSnapshot,
  NativeLogoutResult,
} from "./native-auth-types";

export class NativeAuthGenerationState {
  private generation = 0;
  readonly memory = new NativeAuthMemoryState();

  currentGeneration(): number {
    return this.generation;
  }

  isCurrent(expectedGeneration: number): boolean {
    return this.generation === expectedGeneration;
  }

  fence(expectedGeneration: number): () => boolean {
    return () => this.isCurrent(expectedGeneration);
  }

  beginBarrier(
    expectedGeneration: number,
    reason: NativeAuthReason,
  ): number | undefined {
    if (!this.isCurrent(expectedGeneration)) return undefined;
    this.generation += 1;
    this.memory.unauthenticated(this.generation, reason);
    return this.generation;
  }

  logoutBarrier(): number {
    this.generation += 1;
    this.memory.unauthenticated(this.generation, "logged-out");
    return this.generation;
  }

  fatalBarrier(expectedGeneration: number): number | undefined {
    if (!this.isCurrent(expectedGeneration)) return undefined;
    this.generation += 1;
    this.memory.fatal(this.generation);
    return this.generation;
  }

  current(): NativeAuthSnapshot {
    return this.memory.current();
  }

  access(): string | undefined {
    return this.memory.access();
  }

  subscribe(listener: (state: NativeAuthSnapshot) => void): () => void {
    return this.memory.subscribe(listener);
  }

  toJSON(): NativeAuthSnapshot {
    return this.memory.current();
  }
}

export class NativeAuthFailureRecovery {
  constructor(
    private readonly state: NativeAuthGenerationState,
    private readonly local: NativeAuthLocalState,
    private readonly transport: NativeAuthSessionOptions["transport"],
  ) {}

  async definitiveLoss(
    expectedGeneration: number,
    installation: InstallationAuthState | undefined,
    reason: "definitive-auth-loss" | "restore-ineligible",
  ): Promise<boolean> {
    const lossGeneration = this.state.beginBarrier(expectedGeneration, reason);
    if (lossGeneration === undefined) return false;
    const cleanup = await this.local.cleanup(
      installation,
      this.state.fence(lossGeneration),
    );
    if (cleanup.status === "stale" || !this.state.isCurrent(lossGeneration)) {
      return false;
    }
    if (!cleanup.value.restoreBlocked || !cleanup.value.identityPurged) {
      this.state.memory.fatal(lossGeneration);
    }
    return true;
  }

  async completeLogout(
    logoutGeneration: number,
    cleanup: LocalLogoutCleanup,
  ): Promise<NativeLogoutResult> {
    const localLogoutComplete =
      cleanup.identityPurged &&
      (cleanup.restoreBlocked || cleanup.securePurgeConfirmed);
    if (this.state.isCurrent(logoutGeneration)) {
      if (localLogoutComplete) {
        this.state.memory.unauthenticated(logoutGeneration, "logged-out");
      } else {
        this.state.memory.fatal(logoutGeneration);
      }
    }
    let serverRevocationConfirmed = false;
    if (cleanup.refreshToken !== undefined) {
      try {
        await this.transport.logout(cleanup.refreshToken);
        serverRevocationConfirmed = true;
      } catch {
        // Local completion and server revocation remain separate facts.
      }
    }
    return {
      localLogoutComplete,
      securePurgeConfirmed: cleanup.securePurgeConfirmed,
      serverRevocationConfirmed,
    };
  }

  async storageFailure(
    expectedGeneration: number,
    installation: InstallationAuthState,
    refreshToken: string,
  ): Promise<void> {
    const failureGeneration = this.state.beginBarrier(
      expectedGeneration,
      "secure-storage-failure",
    );
    if (failureGeneration !== undefined) {
      const cleanup = await this.local.cleanup(
        installation,
        this.state.fence(failureGeneration),
      );
      if (
        cleanup.status === "current" &&
        this.state.isCurrent(failureGeneration) &&
        (!cleanup.value.restoreBlocked || !cleanup.value.identityPurged)
      ) {
        this.state.memory.fatal(failureGeneration);
      }
    }
    await this.revokeEphemeral(refreshToken);
  }

  async failFatal(expectedGeneration: number): Promise<void> {
    const fatalGeneration = this.state.fatalBarrier(expectedGeneration);
    if (fatalGeneration === undefined) return;
    await this.local.purgeIdentityState(this.state.fence(fatalGeneration));
  }

  async revokeEphemeral(refreshToken: string): Promise<void> {
    try {
      await this.transport.logout(refreshToken);
    } catch {
      // The raw replacement is discarded; local state remains blocked.
    }
  }
}
