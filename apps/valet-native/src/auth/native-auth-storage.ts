import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import type {
  InstallationAuthState,
  InstallationAuthStateStore,
  SecureRefreshEnvelope,
  SecureRefreshStore,
} from "@valet/employee-client";

const refreshKey = "vaylet.employee.staff-auth.refresh.v1";
const refreshOptions: SecureStore.SecureStoreOptions = {
  keychainService: "com.vaylet.employee.staff-auth",
};
const installationFile = new File(
  Paths.document,
  "vaylet-installation-auth-state-v1.json",
);

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export class ExpoSecureRefreshStore implements SecureRefreshStore {
  async read(): Promise<unknown | null> {
    const stored = await SecureStore.getItemAsync(refreshKey, refreshOptions);
    return stored === null ? null : parseStoredJson(stored);
  }

  async write(envelope: SecureRefreshEnvelope): Promise<void> {
    await SecureStore.setItemAsync(
      refreshKey,
      JSON.stringify(envelope),
      refreshOptions,
    );
  }

  async delete(): Promise<void> {
    await SecureStore.deleteItemAsync(refreshKey, refreshOptions);
  }
}

export class ExpoInstallationAuthStateStore implements InstallationAuthStateStore {
  async read(): Promise<unknown | null> {
    if (!installationFile.exists) return null;
    return parseStoredJson(await installationFile.text());
  }

  async write(state: InstallationAuthState): Promise<void> {
    installationFile.write(JSON.stringify(state));
  }
}
