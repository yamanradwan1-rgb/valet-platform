import * as SecureStore from "expo-secure-store";
import type {
  IncidentRecoveryMarker,
  IncidentRecoveryStore,
} from "@valet/employee-client";

export const nativeIncidentRecoveryStorageKey =
  "vaylet.employee.incident-recovery.v1";
export const nativeIncidentRecoveryStoreOptions: SecureStore.SecureStoreOptions =
  {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    keychainService: "com.vaylet.employee.incident-recovery",
  };

function parseStored(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export class ExpoIncidentRecoveryStore implements IncidentRecoveryStore {
  async read(): Promise<unknown | null> {
    const value = await SecureStore.getItemAsync(
      nativeIncidentRecoveryStorageKey,
      nativeIncidentRecoveryStoreOptions,
    );
    return value === null ? null : parseStored(value);
  }

  async write(marker: IncidentRecoveryMarker): Promise<void> {
    await SecureStore.setItemAsync(
      nativeIncidentRecoveryStorageKey,
      JSON.stringify(marker),
      nativeIncidentRecoveryStoreOptions,
    );
  }

  async delete(): Promise<void> {
    await SecureStore.deleteItemAsync(
      nativeIncidentRecoveryStorageKey,
      nativeIncidentRecoveryStoreOptions,
    );
  }
}
