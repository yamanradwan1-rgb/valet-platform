import { File, Paths } from "expo-file-system";

import { installPhysicalDiagnosticsPersistence } from "./native-physical-diagnostics";

const evidenceFile = new File(
  Paths.document,
  "vaylet-mob-025a-physical-dev.json",
);

export function installNativePhysicalDiagnosticsPersistence(): void {
  if (!__DEV__) return;
  installPhysicalDiagnosticsPersistence({
    clear: async () => {
      if (evidenceFile.exists) evidenceFile.delete();
    },
    read: async () => (evidenceFile.exists ? evidenceFile.text() : null),
    write: async (value) => evidenceFile.write(value),
  });
}
