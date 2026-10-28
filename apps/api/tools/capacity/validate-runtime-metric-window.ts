import { readFileSync } from "node:fs";
import {
  measureRuntimeMetricWindow,
  type RuntimeMetricSample,
} from "./runtime-metric-window";

// stdin must contain sanitized metric envelopes, never raw API logs or tokens.
try {
  const input = readFileSync(0, "utf8");
  if (input.length > 65536) throw new Error();
  const value = JSON.parse(input) as {
    before: RuntimeMetricSample;
    after: RuntimeMetricSample;
    expectedReleaseSha: string;
  };
  process.stdout.write(
    JSON.stringify(
      measureRuntimeMetricWindow(
        value.before,
        value.after,
        value.expectedReleaseSha,
      ),
    ) + "\n",
  );
} catch {
  process.stderr.write(
    "INVALID_RUNTIME_METRIC_WINDOW: no deltas emitted; retain evidence and recollect.\n",
  );
  process.exitCode = 1;
}
