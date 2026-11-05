import { runOcrControl } from "./ocr-control/execute";
import { OcrToolError } from "./ocr-control/restricted-connection";

async function main(): Promise<void> {
  try {
    const completed = await runOcrControl(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(completed)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof OcrToolError ? error.message : "OCR operator action failed."}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("ocr-control.ts")) void main();
