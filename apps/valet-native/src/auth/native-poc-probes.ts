import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";

import { nativeSecureStoreOptions } from "./native-auth-storage";

export type NativePocCapabilityState = "idle" | "checking" | "ok" | "failed";
export type NativePocReachabilityState =
  "idle" | "checking" | "reachable" | "unreachable";

export interface NativePocProbeSnapshot {
  readonly apiReachability: NativePocReachabilityState;
  readonly installationStorage: NativePocCapabilityState;
  readonly secureStore: NativePocCapabilityState;
}

export interface NativePocSecureStorePort {
  delete(key: string): Promise<void>;
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
}

export interface NativePocFileSystemPort {
  delete(): Promise<void> | void;
  read(): Promise<string>;
  write(value: string): Promise<void> | void;
}

interface ApiProbeOptions {
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

export const nativeSecureStoreProbeKey =
  "vaylet.employee.dev.secure-store-probe";
export const nativeInstallationProbeFileName =
  "vaylet-installation-auth-state-dev-probe.txt";
export const initialNativePocProbeSnapshot: NativePocProbeSnapshot = {
  apiReachability: "idle",
  installationStorage: "idle",
  secureStore: "idle",
};
export const checkingNativePocProbeSnapshot: NativePocProbeSnapshot = {
  apiReachability: "checking",
  installationStorage: "checking",
  secureStore: "checking",
};

function syntheticProbeValue(): string {
  return `poc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const secureStorePort: NativePocSecureStorePort = {
  delete: (key) => SecureStore.deleteItemAsync(key, nativeSecureStoreOptions),
  read: (key) => SecureStore.getItemAsync(key, nativeSecureStoreOptions),
  write: (key, value) =>
    SecureStore.setItemAsync(key, value, nativeSecureStoreOptions),
};

function createFileSystemPort(): NativePocFileSystemPort {
  const file = new File(Paths.document, nativeInstallationProbeFileName);
  return {
    delete: () => {
      if (file.exists) file.delete();
    },
    read: () => file.text(),
    write: (value) => file.write(value),
  };
}

export async function probeNativeApiReachability(
  apiOrigin: string,
  options: ApiProbeOptions = {},
): Promise<"reachable" | "unreachable"> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 3000,
  );
  try {
    const response = await (options.fetcher ?? fetch)(`${apiOrigin}/`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
      method: "GET",
      signal: controller.signal,
    });
    return response.ok ? "reachable" : "unreachable";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeNativeSecureStore(
  port: NativePocSecureStorePort = secureStorePort,
): Promise<"ok" | "failed"> {
  const value = syntheticProbeValue();
  let result: "ok" | "failed" = "failed";
  try {
    await port.write(nativeSecureStoreProbeKey, value);
    result =
      (await port.read(nativeSecureStoreProbeKey)) === value ? "ok" : "failed";
  } catch {
    result = "failed";
  }
  try {
    await port.delete(nativeSecureStoreProbeKey);
  } catch {
    result = "failed";
  }
  return result;
}

export async function probeNativeInstallationStorage(
  port: NativePocFileSystemPort = createFileSystemPort(),
): Promise<"ok" | "failed"> {
  const value = syntheticProbeValue();
  let result: "ok" | "failed" = "failed";
  try {
    await port.write(value);
    result = (await port.read()) === value ? "ok" : "failed";
  } catch {
    result = "failed";
  }
  try {
    await port.delete();
  } catch {
    result = "failed";
  }
  return result;
}

export async function runNativePocChecks(
  apiOrigin: string | undefined,
): Promise<NativePocProbeSnapshot> {
  const [apiReachability, secureStore, installationStorage] = await Promise.all(
    [
      apiOrigin === undefined
        ? Promise.resolve("unreachable" as const)
        : probeNativeApiReachability(apiOrigin),
      probeNativeSecureStore(),
      probeNativeInstallationStorage(),
    ],
  );
  return { apiReachability, installationStorage, secureStore };
}
