import type { ConfigContext } from "expo/config";

import { requireNativeReleaseCustomerAppOrigin } from "./src/guest-access/native-customer-app-origin-rules.mjs";

export interface NativeAppConfigEnvironment {
  readonly EXPO_PUBLIC_CUSTOMER_APP_ORIGIN: string | undefined;
  readonly NODE_ENV: string | undefined;
}

/** Expo sets NODE_ENV before evaluating config for its release embed command. */
export function applyNativeReleaseConfigPreflight(
  config: ConfigContext["config"],
  environment: NativeAppConfigEnvironment,
): ConfigContext["config"] {
  if (environment.NODE_ENV === "production") {
    requireNativeReleaseCustomerAppOrigin(
      environment.EXPO_PUBLIC_CUSTOMER_APP_ORIGIN,
    );
  }
  return config;
}

export default ({ config }: ConfigContext): ConfigContext["config"] =>
  applyNativeReleaseConfigPreflight(config, {
    EXPO_PUBLIC_CUSTOMER_APP_ORIGIN:
      process.env.EXPO_PUBLIC_CUSTOMER_APP_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
  });
