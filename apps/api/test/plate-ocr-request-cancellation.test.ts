import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { ownPlateOcrRequestCancellation } from "../src/modules/check-in-api/plate-ocr-request-cancellation";

class FakeRequest extends EventEmitter {
  complete = false;
  aborted = false;
  destroyed = false;
}
class FakeResponse extends EventEmitter {
  writableEnded = false;
  destroyed = false;
}

function setup() {
  const request = new FakeRequest();
  const response = new FakeResponse();
  const signal = ownPlateOcrRequestCancellation(
    request as unknown as IncomingMessage,
    response as unknown as ServerResponse,
  );
  return { request, response, signal };
}

describe("Plate OCR inbound cancellation ownership", () => {
  it("does not abort when the normal multipart upload finishes and req closes", () => {
    const c = setup();
    c.request.complete = true;
    c.request.emit("close");
    expect(c.signal.aborted).toBe(false);
    expect(c.request.listenerCount("close")).toBe(1);
    c.response.writableEnded = true;
    c.response.emit("finish");
    c.response.emit("close");
    expect(c.signal.aborted).toBe(false);
    expect(c.request.listenerCount("aborted")).toBe(0);
    expect(c.request.listenerCount("close")).toBe(0);
    expect(c.response.listenerCount("close")).toBe(0);
    expect(c.response.listenerCount("finish")).toBe(0);
  });

  it("aborts a partially received multipart request", () => {
    const c = setup();
    c.request.destroyed = true;
    c.request.emit("close");
    expect(c.signal.aborted).toBe(true);
    c.response.emit("close");
    expect(c.response.listenerCount("close")).toBe(0);
  });

  it("aborts when the client disconnects after a complete upload, before reply", () => {
    const c = setup();
    c.request.complete = true;
    c.request.emit("close");
    expect(c.signal.aborted).toBe(false);
    c.response.emit("close");
    expect(c.signal.aborted).toBe(true);
    expect(c.request.listenerCount("aborted")).toBe(0);
  });

  it("aborts on aborted event or already destroyed initial request", () => {
    const c = setup();
    c.request.emit("aborted");
    expect(c.signal.aborted).toBe(true);

    const request = new FakeRequest();
    request.aborted = true;
    const response = new FakeResponse();
    const signal = ownPlateOcrRequestCancellation(
      request as unknown as IncomingMessage,
      response as unknown as ServerResponse,
    );
    expect(signal.aborted).toBe(true);
    response.emit("close");
    expect(request.listenerCount("aborted")).toBe(0);
  });
});
