import type { NativeAuthSnapshot } from "@valet/employee-client";

import type { NativePocProbeSnapshot } from "./native-poc-probes";

export interface NativePocPresentation {
  readonly apiOrigin: string;
  readonly apiReachability: string;
  readonly authGeneration: string;
  readonly authPhase: string;
  readonly authReason: string;
  readonly installationStorage: string;
  readonly secureStore: string;
  readonly title: "DEV POC";
}

export function getNativePocPresentation(
  development: boolean,
  apiOrigin: string | undefined,
  probes: NativePocProbeSnapshot,
  auth: NativeAuthSnapshot,
): NativePocPresentation | null {
  if (!development) return null;
  return {
    apiOrigin: apiOrigin ?? "unavailable",
    apiReachability: probes.apiReachability,
    authGeneration: String(auth.authGeneration),
    authPhase: auth.phase,
    authReason: auth.reason ?? "none",
    installationStorage: probes.installationStorage,
    secureStore: probes.secureStore,
    title: "DEV POC",
  };
}
