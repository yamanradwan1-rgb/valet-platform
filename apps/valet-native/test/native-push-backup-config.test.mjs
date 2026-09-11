import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import backupPlugin from "../plugins/with-native-push-backup-exclusion.cjs";

const temporaryProjects = [];

afterEach(async () => {
  await Promise.all(
    temporaryProjects
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("Native push Android backup configuration", () => {
  it("targets the exact installation state file", async () => {
    const installationSource = await readFile(
      new URL(
        "../src/notifications/native-push-installation.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(installationSource).toContain(
      `"${backupPlugin.installationStatePath}"`,
    );
  });

  it("excludes only SecureStore and installation state from legacy backup", () => {
    expect(backupPlugin.legacyBackupRules).toContain(
      '<exclude domain="sharedpref" path="SecureStore"/>',
    );
    expect(backupPlugin.legacyBackupRules).toContain(
      '<exclude domain="file" path="vaylet-push-installation-v1.json"/>',
    );
    expect(backupPlugin.legacyBackupRules).not.toContain("<include");
  });

  it("excludes installation state from cloud backup and device transfer", () => {
    expect(backupPlugin.dataExtractionRules).toContain("<cloud-backup>");
    expect(backupPlugin.dataExtractionRules).toContain("<device-transfer>");
    expect(
      backupPlugin.dataExtractionRules.match(
        /<exclude domain="file" path="vaylet-push-installation-v1\.json"\/>/g,
      ),
    ).toHaveLength(2);
  });

  it("writes the exact Android CNG resource files", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "vaylet-push-"));
    temporaryProjects.push(project);
    await backupPlugin.writeNativePushBackupRules(project);
    const resourceDirectory = path.join(
      project,
      "app",
      "src",
      "main",
      "res",
      "xml",
    );
    await expect(
      readFile(path.join(resourceDirectory, "vaylet_backup_rules.xml"), "utf8"),
    ).resolves.toBe(backupPlugin.legacyBackupRules);
    await expect(
      readFile(
        path.join(resourceDirectory, "vaylet_data_extraction_rules.xml"),
        "utf8",
      ),
    ).resolves.toBe(backupPlugin.dataExtractionRules);
  });
});
