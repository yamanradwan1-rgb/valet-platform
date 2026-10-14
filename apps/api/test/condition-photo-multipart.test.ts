import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { parseConditionPhotoMultipart } from "../src/modules/check-in-api/condition-photo-multipart";

const operationId = "22222222-2222-4222-8222-222222222222";
const boundary = "vayletp2boundary";
const line = "\r\n";

function part(name: string, data: Buffer | string, filename?: string): Buffer {
  const header = filename
    ? `Content-Disposition: form-data; name="${name}"; filename="${filename}"${line}Content-Type: image/jpeg`
    : `Content-Disposition: form-data; name="${name}"`;
  return Buffer.concat([
    Buffer.from(`--${boundary}${line}${header}${line}${line}`),
    Buffer.isBuffer(data) ? data : Buffer.from(data),
    Buffer.from(line),
  ]);
}

function request(parts: Buffer[], headers?: Record<string, string>) {
  const data = Buffer.concat([...parts, Buffer.from(`--${boundary}--${line}`)]);
  const source = Readable.from([data]) as IncomingMessage;
  Object.assign(source, {
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(data.length),
      ...headers,
    },
  });
  return source;
}

describe("condition photo strict multipart", () => {
  it("accepts exactly one operationId and one jpeg image", async () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const parsed = await parseConditionPhotoMultipart(request([
      part("operationId", operationId),
      part("image", image, "synthetic.jpg"),
    ]));
    expect(parsed.clientOperationId).toBe(operationId);
    expect(parsed.imageBytes).toEqual(image);
  });

  it("rejects unknown parts, duplicated fields and invalid UUIDs", async () => {
    await expect(parseConditionPhotoMultipart(request([
      part("operationId", operationId),
      part("extra", "not allowed"),
      part("image", Buffer.from([0xff, 0xd8]), "synthetic.jpg"),
    ]))).rejects.toThrow();
    await expect(parseConditionPhotoMultipart(request([
      part("operationId", operationId),
      part("operationId", operationId),
    ]))).rejects.toThrow();
    await expect(parseConditionPhotoMultipart(request([
      part("operationId", "not-a-uuid"),
      part("image", Buffer.from([0xff, 0xd8]), "synthetic.jpg"),
    ]))).rejects.toThrow();
  });

  it("rejects declared oversized and malformed multipart request bodies", async () => {
    await expect(parseConditionPhotoMultipart(request([], {
      "content-length": String(8 * 1024 * 1024 + 16385),
    }))).rejects.toMatchObject({ code: "CONDITION_PHOTO_TOO_LARGE" });
    await expect(parseConditionPhotoMultipart(request([], {
      "content-type": "application/json",
    }))).rejects.toThrow();
  });
});
