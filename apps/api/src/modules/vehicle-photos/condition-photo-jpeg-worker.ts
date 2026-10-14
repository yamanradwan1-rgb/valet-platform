import { parentPort, workerData } from "node:worker_threads";

import sharp from "sharp";

interface WorkerInput {
  readonly bytes: Uint8Array;
  readonly verifyOnly?: boolean;
}

/** Hard worker boundary. Input is never trusted from a multipart header. */
async function decodeAndCanonicalize(input: WorkerInput) {
  sharp.cache(false);
  sharp.concurrency(1);
  const bytes = Buffer.from(input.bytes);
  const decoder = () =>
    sharp(bytes, {
      failOn: "error",
      limitInputPixels: 12_000_000,
      sequentialRead: true,
    }).timeout({ seconds: 5 });

  const metadata = await decoder().metadata();
  if (
    metadata.format !== "jpeg" ||
    metadata.pages !== undefined && metadata.pages !== 1 ||
    !metadata.width || !metadata.height ||
    metadata.width > 4096 || metadata.height > 4096 ||
    metadata.width * metadata.height > 12_000_000
  ) throw new Error("INVALID_IMAGE");

  if (input.verifyOnly) {
    if (metadata.exif || metadata.xmp || metadata.icc || metadata.orientation)
      throw new Error("INVALID_IMAGE");
    // Full decode is required: a valid header is not enough for retained evidence.
    await decoder().raw().toBuffer();
    return { data: bytes, width: metadata.width, height: metadata.height };
  }

  // rotate() applies EXIF orientation to pixels; default output strips metadata.
  const output = await decoder()
    .rotate()
    .jpeg({ quality: 90, mozjpeg: false })
    .toBuffer({ resolveWithObject: true });
  if (
    output.info.width < 1 || output.info.height < 1 ||
    output.info.width > 4096 || output.info.height > 4096 ||
    output.info.width * output.info.height > 12_000_000 ||
    output.data.length === 0 || output.data.length > 8 * 1024 * 1024
  ) throw new Error("INVALID_IMAGE");

  const canonical = await sharp(output.data, {
    failOn: "error",
    limitInputPixels: 12_000_000,
  }).metadata();
  if (canonical.format !== "jpeg" ||
      canonical.width !== output.info.width ||
      canonical.height !== output.info.height ||
      canonical.exif !== undefined || canonical.xmp !== undefined ||
      canonical.icc !== undefined) throw new Error("INVALID_IMAGE");

  return {
    data: output.data,
    width: output.info.width,
    height: output.info.height,
  };
}

void decodeAndCanonicalize(workerData as WorkerInput).then(
  (result) => parentPort?.postMessage({ ok: true, ...result }),
  () => parentPort?.postMessage({ ok: false, code: "INVALID_IMAGE" }),
);
