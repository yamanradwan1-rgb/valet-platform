import { detectExpiredOcr } from "./ocr-control/maintenance";
import {
  OcrToolError,
  withRestrictedOcrClient,
} from "./ocr-control/restricted-connection";

/** A scheduler may invoke this once per 30 seconds, never from Check-In. */
export async function runOcrMaintenanceSweep(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  return withRestrictedOcrClient("maintenance", environment, detectExpiredOcr);
}

async function main(): Promise<void> {
  try {
    await runOcrMaintenanceSweep();
    process.stdout.write("OCR maintenance sweep finished.\n");
  } catch (error) {
    process.stderr.write(
      `${error instanceof OcrToolError ? error.message : "OCR maintenance failed."}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("ocr-maintenance-sweep.ts")) void main();
