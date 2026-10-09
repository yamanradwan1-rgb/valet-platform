import { requireOptionalNativeModule } from "expo";

export type FrameworkPowerAllowlist = "exempt" | "not-exempt" | "unknown";

interface VayletBatteryStatusModule {
  readPowerAllowlistAsync(): Promise<FrameworkPowerAllowlist>;
  openBatterySettingsAsync(): Promise<boolean>;
}

export function loadVayletBatteryStatusModule(): VayletBatteryStatusModule | null {
  try {
    return requireOptionalNativeModule<VayletBatteryStatusModule>(
      "VayletBatteryStatus",
    );
  } catch {
    return null;
  }
}
