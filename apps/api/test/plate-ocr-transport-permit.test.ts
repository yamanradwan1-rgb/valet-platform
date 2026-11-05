import { describe, expect, it, vi } from "vitest";
import { readPlateOcrConfig } from "../src/modules/check-in-api/plate-ocr-config";
import { PlateOcrProviderTransport } from "../src/modules/check-in-api/plate-ocr-provider-transport";

const config = readPlateOcrConfig({
  NODE_ENV: "production",
  PLATE_OCR_ENDPOINT: "https://ocr.example.test/read/",
  PLATE_OCR_TOKEN: "test-only-secret",
})!;

describe("OCR transport mandatory dispatch capability", () => {
  it("rejects a missing or invalid permit even when transport is called directly", () => {
    const http = vi.fn<typeof fetch>();
    const transport = new PlateOcrProviderTransport(
      config,
      { image: new Uint8Array([255, 216, 255, 217]), plateCountry: "JO" },
      http,
    );
    try {
      expect(transport.dispatch(undefined as never)).toBeUndefined();
      expect(transport.dispatch({} as never)).toBeUndefined();
      expect(
        transport.dispatch({ consumeIfFresh: () => false }),
      ).toBeUndefined();
      expect(
        transport.dispatch({
          consumeIfFresh: () => {
            throw new Error("bad");
          },
        }),
      ).toBeUndefined();
      expect(http).not.toHaveBeenCalled();
      expect(transport.fetchInvoked).toBe(false);
    } finally {
      transport.cleanup();
    }
  });
});
