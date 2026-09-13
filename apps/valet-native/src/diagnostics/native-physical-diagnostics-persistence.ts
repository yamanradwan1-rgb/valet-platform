import { installPhysicalDiagnosticsPersistence } from "./native-physical-diagnostics";

type ExpoFileSystemModule = Pick<
  typeof import("expo-file-system"),
  "File" | "Paths"
>;
type ExpoFileSystemLoader = () => Promise<ExpoFileSystemModule>;

const loadExpoFileSystem: ExpoFileSystemLoader = () =>
  import("expo-file-system");

export async function installNativePhysicalDiagnosticsPersistence(
  loadFileSystem: ExpoFileSystemLoader = loadExpoFileSystem,
): Promise<void> {
  if (typeof __DEV__ !== "boolean" || !__DEV__) return;
  try {
    const { File, Paths } = await loadFileSystem();
    const evidenceFile = new File(
      Paths.document,
      "vaylet-mob-025a-physical-dev.json",
    );
    installPhysicalDiagnosticsPersistence({
      clear: async () => {
        if (evidenceFile.exists) evidenceFile.delete();
      },
      read: async () => (evidenceFile.exists ? evidenceFile.text() : null),
      write: async (value) => evidenceFile.write(value),
    });
  } catch {
    // Optional development evidence stays on the memory-only diagnostics store.
  }
}
