/**
 * @zxing/browser adapter (DEC-067 §1) — the ONLY module allowed to import the
 * scanner library. The import is dynamic so the library is never evaluated
 * during SSR and only loads when an employee explicitly opens a scanner.
 *
 * Rear-camera preference is expressed as facingMode: { ideal: "environment" };
 * audio is never requested.
 */

import type { QrDecoderHandle } from "./qr-scan-session";

export interface ZxingCameraOpenRequest {
  /** Live preview element that will carry the MediaStream. */
  readonly video: HTMLVideoElement;
  /** Called for every non-empty decoded QR text frame. */
  readonly onText: (text: string) => void;
}

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    height: { ideal: 720 },
    width: { ideal: 1280 },
  },
};

export async function openZxingQrCamera(
  request: ZxingCameraOpenRequest,
): Promise<QrDecoderHandle> {
  const { BrowserQRCodeReader } = await import("@zxing/browser");
  const reader = new BrowserQRCodeReader();
  const controls = await reader.decodeFromConstraints(
    CAMERA_CONSTRAINTS,
    request.video,
    (result) => {
      if (result === undefined || result === null) return;
      const text: unknown = result.getText();
      if (typeof text === "string" && text.length > 0) {
        request.onText(text);
      }
    },
  );
  return {
    stop: () => {
      controls.stop();
    },
  };
}
