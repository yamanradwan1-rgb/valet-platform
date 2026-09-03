import {
  installationState,
  parseInstallationAuthState,
  parseSecureRefreshEnvelope,
} from "./native-auth-state";
import type {
  InstallationAuthState,
  NativeAuthSessionOptions,
  SecureRefreshEnvelope,
} from "./native-auth-types";

export interface NativeAuthStoredState {
  readonly envelope: SecureRefreshEnvelope | undefined;
  readonly installation: InstallationAuthState | undefined;
  readonly rawEnvelopePresent: boolean;
}

export class NativeAuthStorage {
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: NativeAuthSessionOptions) {}

  serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async read(): Promise<NativeAuthStoredState> {
    const [rawInstallation, rawEnvelope] = await Promise.all([
      this.options.installationState.read(),
      this.options.secureRefresh.read(),
    ]);
    return {
      envelope: parseSecureRefreshEnvelope(rawEnvelope),
      installation: parseInstallationAuthState(rawInstallation),
      rawEnvelopePresent: rawEnvelope !== null,
    };
  }

  async readInstallation(): Promise<InstallationAuthState | undefined> {
    return parseInstallationAuthState(
      await this.options.installationState.read(),
    );
  }

  async createBlockedInstallation(): Promise<InstallationAuthState> {
    const created = installationState(
      this.options.createInstallationGeneration(),
      true,
    );
    await this.options.installationState.write(created);
    return created;
  }

  async writeSecure(
    refreshToken: string,
    installation: InstallationAuthState,
  ): Promise<void> {
    await this.options.secureRefresh.write({
      installationGeneration: installation.generation,
      refreshToken,
      version: 1,
    });
  }

  async activateInstallation(
    installation: InstallationAuthState,
  ): Promise<void> {
    await this.options.installationState.write(
      installationState(installation.generation, false),
    );
  }

  async block(
    installation: InstallationAuthState | undefined,
  ): Promise<boolean> {
    if (installation === undefined) return false;
    try {
      await this.options.installationState.write(
        installationState(installation.generation, true),
      );
      return true;
    } catch {
      return false;
    }
  }

  async deleteSecure(): Promise<boolean> {
    try {
      await this.options.secureRefresh.delete();
      return true;
    } catch {
      return false;
    }
  }
}
