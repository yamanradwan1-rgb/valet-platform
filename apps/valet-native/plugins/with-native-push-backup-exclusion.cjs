const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

const installationStatePath = "vaylet-push-installation-v1.json";
const backupRulesResource = "vaylet_backup_rules";
const dataExtractionRulesResource = "vaylet_data_extraction_rules";

const legacyBackupRules = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="sharedpref" path="SecureStore"/>
  <exclude domain="file" path="${installationStatePath}"/>
</full-backup-content>
`;

const dataExtractionRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="sharedpref" path="SecureStore"/>
    <exclude domain="file" path="${installationStatePath}"/>
  </cloud-backup>
  <device-transfer>
    <exclude domain="sharedpref" path="SecureStore"/>
    <exclude domain="file" path="${installationStatePath}"/>
  </device-transfer>
</data-extraction-rules>
`;

async function writeNativePushBackupRules(platformProjectRoot) {
  const resourceDirectory = path.join(
    platformProjectRoot,
    "app",
    "src",
    "main",
    "res",
    "xml",
  );
  await mkdir(resourceDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(resourceDirectory, `${backupRulesResource}.xml`),
      legacyBackupRules,
      "utf8",
    ),
    writeFile(
      path.join(resourceDirectory, `${dataExtractionRulesResource}.xml`),
      dataExtractionRules,
      "utf8",
    ),
  ]);
}

function withNativePushBackupExclusion(config) {
  config = withAndroidManifest(config, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults,
    );
    application.$["android:fullBackupContent"] = `@xml/${backupRulesResource}`;
    application.$["android:dataExtractionRules"] =
      `@xml/${dataExtractionRulesResource}`;
    return manifestConfig;
  });
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      await writeNativePushBackupRules(
        modConfig.modRequest.platformProjectRoot,
      );
      return modConfig;
    },
  ]);
}

module.exports = withNativePushBackupExclusion;
module.exports.backupRulesResource = backupRulesResource;
module.exports.dataExtractionRules = dataExtractionRules;
module.exports.dataExtractionRulesResource = dataExtractionRulesResource;
module.exports.installationStatePath = installationStatePath;
module.exports.legacyBackupRules = legacyBackupRules;
module.exports.writeNativePushBackupRules = writeNativePushBackupRules;
