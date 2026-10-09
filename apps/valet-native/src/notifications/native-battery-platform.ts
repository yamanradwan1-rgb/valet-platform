import { Platform } from "react-native";

import { loadVayletBatteryStatusModule } from "../../modules/vaylet-battery-status";
import type { NativeBatteryOptimizationAdapter } from "./native-battery-status";

/** Only the framework power-allowlist can be inferred; OEM 'Unrestricted' cannot. */
export class AndroidBatteryOptimizationAdapter implements NativeBatteryOptimizationAdapter {
  async readStatus() {
    if (Platform.OS !== "android") return "unsupported" as const;
    const bridge = loadVayletBatteryStatusModule();
    if (bridge === null) return "unsupported" as const;
    try {
      const state = await bridge.readPowerAllowlistAsync();
      if (state === "exempt") return "configured" as const;
      if (state === "not-exempt") return "restricted" as const;
      return "unknown" as const;
    } catch {
      return "unknown" as const;
    }
  }

  async openSettings(): Promise<void> {
    if (Platform.OS !== "android") return;
    const bridge = loadVayletBatteryStatusModule();
    try {
      await bridge?.openBatterySettingsAsync();
    } catch {
      // Settings UI may be missing or blocked by device policy; never crash.
    }
  }
}
