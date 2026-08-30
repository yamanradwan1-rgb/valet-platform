import { stopAllStreamTracks } from "../scanner/camera-stream-tracks";

export const PLATE_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" } },
};

export interface PlateCameraMediaDevices {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

/** Opens only a live preview. It performs no OCR, upload, or persistence. */
export async function openPlateCamera(
  video: HTMLVideoElement,
  mediaDevices: PlateCameraMediaDevices = navigator.mediaDevices,
): Promise<MediaStream> {
  const stream = await mediaDevices.getUserMedia(PLATE_CAMERA_CONSTRAINTS);
  video.srcObject = stream;
  try {
    await video.play();
    return stream;
  } catch (error) {
    stopAllStreamTracks(stream);
    if (video.srcObject === stream) video.srcObject = null;
    throw error;
  }
}

/** Copies the currently displayed frame into one memory-only canvas. */
export function capturePlateFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): void {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width < 1 || height < 1) {
    throw new Error("Plate camera preview has no capturable frame");
  }
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Plate camera canvas is unavailable");
  }
  canvas.width = width;
  canvas.height = height;
  context.drawImage(video, 0, 0, width, height);
}

/** Clears both visible pixels and the backing pixel buffer. */
export function clearPlateFrame(canvas: HTMLCanvasElement | null): void {
  if (canvas === null) return;
  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
}
