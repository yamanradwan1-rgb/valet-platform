import { File, Paths } from "expo-file-system";
import { nativeSecureRandomUUID } from "../crypto/native-secure-crypto";

import type { NativePushInstallationId } from "./native-push-types";

const installationFileName = "vaylet-push-installation-v1.json";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface NativePushInstallationStore {
  read(): Promise<unknown | null>;
  write(value: {
    readonly installationId: string;
    readonly version: 1;
  }): Promise<void>;
}

export class ExpoNativePushInstallationStore implements NativePushInstallationStore {
  private readonly file = new File(Paths.document, installationFileName);

  async read(): Promise<unknown | null> {
    if (!this.file.exists) return null;
    try {
      return JSON.parse(await this.file.text()) as unknown;
    } catch {
      return null;
    }
  }

  async write(value: {
    readonly installationId: string;
    readonly version: 1;
  }): Promise<void> {
    this.file.write(JSON.stringify(value));
  }
}

function readInstallationId(value: unknown): string | undefined {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\u0000") !== "installationId\u0000version"
  ) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return record.version === 1 &&
    typeof record.installationId === "string" &&
    uuidPattern.test(record.installationId)
    ? record.installationId
    : undefined;
}

export function createNativeInstallationUuid(): string {
  return nativeSecureRandomUUID();
}

export class NativePushInstallationIdOwner implements NativePushInstallationId {
  private current: string | undefined;
  private loading: Promise<string> | undefined;

  constructor(
    private readonly store: NativePushInstallationStore,
    private readonly createUuid: () => string = createNativeInstallationUuid,
  ) {}

  async getOrCreate(): Promise<string> {
    if (this.current !== undefined) return this.current;
    if (this.loading !== undefined) return this.loading;
    const loading = this.load();
    this.loading = loading;
    try {
      return await loading;
    } finally {
      if (this.loading === loading) this.loading = undefined;
    }
  }

  private async load(): Promise<string> {
    const stored = readInstallationId(await this.store.read());
    if (stored !== undefined) {
      this.current = stored;
      return stored;
    }
    const created = this.createUuid();
    if (!uuidPattern.test(created)) {
      throw new Error("Push installation state is unavailable.");
    }
    await this.store.write({ installationId: created, version: 1 });
    this.current = created;
    return created;
  }
}
