const { withAndroidManifest } = require("expo/config-plugins");

/** Expo bundles a background task service even with background options off. */
module.exports = function withShiftPresenceForegroundOnly(config) {
  return withAndroidManifest(config, (value) => {
    const manifest = value.modResults.manifest;
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    const application = manifest.application[0];
    application.service ??= [];
    application.service.push({
      $: {
        "android:name": "expo.modules.location.services.LocationTaskService",
        "tools:node": "remove",
      },
    });
    manifest["uses-permission"] ??= [];
    for (const name of [
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.FOREGROUND_SERVICE_LOCATION",
    ]) {
      manifest["uses-permission"].push({
        $: { "android:name": name, "tools:node": "remove" },
      });
    }
    return value;
  });
};
