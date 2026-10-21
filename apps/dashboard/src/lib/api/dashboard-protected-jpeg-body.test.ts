import { describe, expect, it } from "vitest";
import { readProtectedJpegBody } from "./dashboard-protected-jpeg-body";

describe("#309 streamed protected JPEG boundary", () => {
  it("reads exactly bounded chunks and validates Content-Length early", async () => {
    const bytes = await readProtectedJpegBody(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
      headers: { "Content-Length": "4" },
    }));
    expect(bytes).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    await expect(readProtectedJpegBody(new Response("unread", {
      headers: { "Content-Length": String(8 * 1024 * 1024 + 1) },
    }))).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });
  it("rejects an unadvertised body that exceeds the cap while streaming", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 * 1024));
        controller.enqueue(new Uint8Array([0xff]));
        controller.close();
      },
    });
    await expect(readProtectedJpegBody(new Response(body))).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
    });
  });
});
