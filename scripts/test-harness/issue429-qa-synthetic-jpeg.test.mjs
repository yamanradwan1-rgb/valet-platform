import assert from "node:assert/strict";
import { test } from "node:test";

import { issue429SyntheticJpeg } from "./issue429-qa-synthetic-jpeg.mjs";

test("synthetic OCR QA image is a complete bounded JPEG, not a marker-only fake", () => {
  const jpeg = issue429SyntheticJpeg();
  assert.ok(jpeg.length > 400 && jpeg.length < 1024 * 1024);
  assert.deepEqual([...jpeg.subarray(0, 2)], [255, 216]);
  assert.deepEqual([...jpeg.subarray(-2)], [255, 217]);
  // SOF0: height 16, width 32, and 3 color channels in encoded real JPEG.
  const sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(sof > 0);
  assert.equal(jpeg.readUInt16BE(sof + 5), 16);
  assert.equal(jpeg.readUInt16BE(sof + 7), 32);
  assert.equal(jpeg[sof + 9], 3);
});
