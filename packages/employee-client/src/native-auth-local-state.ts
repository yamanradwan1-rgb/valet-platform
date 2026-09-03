import type { StaffNativeAuthResponse } from "@valet/contracts/staff-auth";

import {
  NativeAuthStorage,
  type NativeAuthStoredState,
} from "./native-auth-storage";
import type {
  InstallationAuthState,
  NativeAuthSessionOptions,
} from "./native-auth-types";

export type GuardedResult<T> =
  | { readonly status: "current"; readonly value: T }
  | { readonly status: "stale" };

export interface LocalAuthCleanup {
  readonly identityPurged: boolean;
  readonly restoreBlocked: boolean;
  readonly securePurgeConfirmed: boolean;
}

export interface LocalLogoutCleanup extends LocalAuthCleanup {
  readonly refreshToken: string | undefined;
}

const stale = { status: "stale" } as const;
const current = <T>(value: T): GuardedResult<T> => ({
  status: "current",
  value,
});

export class NativeAuthLocalState {
  private readonly storage: NativeAuthStorage;

  constructor(private readonly options: NativeAuthSessionOptions) {
    this.storage = new NativeAuthStorage(options);
  }

  read(fence: () => boolean): Promise<GuardedResult<NativeAuthStoredState>> {
    return this.storage.serializeMutation(async () => {
      if (!fence()) return stale;
      const stored = await this.storage.read();
      return fence() ? current(stored) : stale;
    });
  }

  prepareLogin(
    fence: () => boolean,
  ): Promise<GuardedResult<InstallationAuthState>> {
    return this.storage.serializeMutation(async () => {
      if (!fence()) return stale;
      const existing = await this.storage.readInstallation();
      if (!fence()) return stale;
      if (existing !== undefined) return current(existing);
      const created = await this.storage.createBlockedInstallation();
      return fence() ? current(created) : stale;
    });
  }

  commitResponse(
    response: StaffNativeAuthResponse,
    installation: InstallationAuthState,
    fence: () => boolean,
  ): Promise<GuardedResult<void>> {
    return this.storage.serializeMutation(async () => {
      if (!fence()) return stale;
      await this.storage.writeSecure(response.refreshToken, installation);
      if (!fence()) return stale;
      await this.storage.activateInstallation(installation);
      return fence() ? current(undefined) : stale;
    });
  }

  establishBlockedInstallation(
    rawEnvelopePresent: boolean,
    fence: () => boolean,
  ): Promise<GuardedResult<void>> {
    return this.storage.serializeMutation(async () => {
      if (!fence()) return stale;
      if (rawEnvelopePresent) {
        await this.storage.deleteSecure();
        if (!fence()) return stale;
      }
      await this.storage.createBlockedInstallation();
      return fence() ? current(undefined) : stale;
    });
  }

  deleteSecure(fence: () => boolean): Promise<GuardedResult<boolean>> {
    return this.storage.serializeMutation(async () => {
      if (!fence()) return stale;
      const deleted = await this.storage.deleteSecure();
      return fence() ? current(deleted) : stale;
    });
  }

  cleanup(
    installation: InstallationAuthState | undefined,
    fence: () => boolean,
  ): Promise<GuardedResult<LocalAuthCleanup>> {
    return this.storage.serializeMutation(async () => {
      if (!fence()) return stale;
      const restoreBlocked = await this.storage.block(installation);
      if (!fence()) return stale;
      const identityPurged = await this.purgeIdentity();
      if (!fence()) return stale;
      const securePurgeConfirmed = await this.storage.deleteSecure();
      if (!fence()) return stale;
      return current({
        identityPurged,
        restoreBlocked,
        securePurgeConfirmed,
      });
    });
  }

  logout(fence: () => boolean): Promise<GuardedResult<LocalLogoutCleanup>> {
    return this.storage.serializeMutation(async () => {
      if (!fence()) return stale;
      let stored: NativeAuthStoredState | undefined;
      try {
        stored = await this.storage.read();
      } catch {
        // The generation barrier still requires best-effort local cleanup.
      }
      if (!fence()) return stale;
      const installation = stored?.installation;
      const refreshToken =
        installation !== undefined &&
        stored?.envelope?.installationGeneration === installation.generation
          ? stored.envelope.refreshToken
          : undefined;
      const restoreBlocked = await this.storage.block(installation);
      if (!fence()) return stale;
      const identityPurged = await this.purgeIdentity();
      if (!fence()) return stale;
      const securePurgeConfirmed = await this.storage.deleteSecure();
      if (!fence()) return stale;
      return current({
        identityPurged,
        refreshToken,
        restoreBlocked,
        securePurgeConfirmed,
      });
    });
  }

  purgeIdentityState(fence: () => boolean): Promise<GuardedResult<boolean>> {
    return this.storage.serializeMutation(async () => {
      if (!fence()) return stale;
      const purged = await this.purgeIdentity();
      return fence() ? current(purged) : stale;
    });
  }

  private async purgeIdentity(): Promise<boolean> {
    try {
      await this.options.identityState.purge();
      return true;
    } catch {
      return false;
    }
  }
}
