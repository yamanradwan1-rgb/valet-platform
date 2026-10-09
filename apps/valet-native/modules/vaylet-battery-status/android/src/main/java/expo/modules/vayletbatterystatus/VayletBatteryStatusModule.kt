package expo.modules.vayletbatterystatus

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Android framework power allowlist only; OEM-specific battery modes are not inferred. */
class VayletBatteryStatusModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VayletBatteryStatus")

    AsyncFunction("readPowerAllowlistAsync") {
      val context = appContext.reactContext ?: return@AsyncFunction "unknown"
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@AsyncFunction "unknown"
      try {
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
          ?: return@AsyncFunction "unknown"
        if (power.isIgnoringBatteryOptimizations(context.packageName)) {
          "exempt"
        } else {
          "not-exempt"
        }
      } catch (_: Exception) {
        "unknown"
      }
    }

    AsyncFunction("openBatterySettingsAsync") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val primary = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${context.packageName}")
      }
      listOf(primary, fallback).any { intent ->
        try {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          true
        } catch (_: Exception) {
          false
        }
      }
    }
  }
}
