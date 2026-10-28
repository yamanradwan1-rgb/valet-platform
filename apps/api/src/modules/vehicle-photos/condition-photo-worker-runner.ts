import { existsSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

import { ConditionPhotoDecodeError } from "./condition-photo-decode-error";
import {
  conditionPhotoProcessingMetrics as metrics,
  type PhotoFailure,
} from "./condition-photo-processing-metrics";

export interface ConditionPhotoWorkerReply {
  readonly ok: boolean;
  readonly data?: Uint8Array;
  readonly width?: number;
  readonly height?: number;
  readonly startupMs?: number;
  readonly metadataMs?: number;
  readonly normalizationMs?: number;
}

function workerFilename(): { filename: string; execArgv?: string[] } {
  const compiled = join(__dirname, "condition-photo-jpeg-worker.js");
  if (existsSync(compiled)) return { filename: compiled };
  return {
    filename: join(__dirname, "condition-photo-jpeg-worker.ts"),
    execArgv: ["--import", "tsx"],
  };
}

/** A fresh worker contains untrusted native decode state to one bounded job. */
export async function runConditionPhotoWorker(
  bytes: Buffer,
  verifyOnly: boolean,
  signal?: AbortSignal,
): Promise<ConditionPhotoWorkerReply> {
  if (signal?.aborted)
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_STORAGE_UNAVAILABLE");
  const options = workerFilename();
  let worker: Worker;
  const started = performance.now();
  try {
    worker = new Worker(options.filename, {
      ...(options.execArgv ? { execArgv: options.execArgv } : {}),
      workerData: {
        bytes,
        verifyOnly,
        startedAt: performance.timeOrigin + started,
      },
      resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 },
    });
  } catch {
    metrics.failures.workerCrash++;
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_STORAGE_UNAVAILABLE");
  }
  let abort: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let terminationFailed = false;
  let reply: ConditionPhotoWorkerReply;
  try {
    reply = await new Promise<ConditionPhotoWorkerReply>((resolve, reject) => {
      let finished = false;
      const fail = (reason: PhotoFailure) => {
        if (finished) return;
        finished = true;
        metrics.failures[reason]++;
        reject(
          new ConditionPhotoDecodeError("CONDITION_PHOTO_STORAGE_UNAVAILABLE"),
        );
      };
      abort = () => fail("cancelled");
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => fail("processingTimeout"), 5000);
      worker.once("message", (reply: ConditionPhotoWorkerReply) => {
        if (finished) return;
        finished = true;
        if (typeof reply.startupMs === "number")
          metrics.observe("startup", reply.startupMs);
        if (typeof reply.metadataMs === "number")
          metrics.observe("metadata", reply.metadataMs);
        if (typeof reply.normalizationMs === "number")
          metrics.observe("normalization", reply.normalizationMs);
        resolve(reply);
      });
      worker.once("error", () => fail("workerCrash"));
      // Even a clean exit without a reply must settle; never hang until timeout.
      worker.once("exit", () => fail("workerCrash"));
    });
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
    const terminating = performance.now();
    try {
      await worker.terminate();
    } catch {
      metrics.failures.workerCrash++;
      terminationFailed = true;
    }
    metrics.observe("termination", performance.now() - terminating);
  }
  if (terminationFailed)
    throw new ConditionPhotoDecodeError("CONDITION_PHOTO_STORAGE_UNAVAILABLE");
  return reply;
}
