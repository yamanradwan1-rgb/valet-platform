import { File } from "expo-file-system";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";

export function inspectPlateFile(uri: string): {
  exists: boolean;
  size: number;
} {
  const file = new File(uri);
  return { exists: file.exists, size: file.size };
}

/** A failed deletion remains a failure, even if bounded cleanup subsequently succeeds. */
export async function removePlateFile(uri: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
      if (attempt === 0) return;
      break;
    } catch {
      logNativePlateOcr("roi-cleanup-failure");
    }
  }
  throw new Error("Plate image cleanup unavailable.");
}
