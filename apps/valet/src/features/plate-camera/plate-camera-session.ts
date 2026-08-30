import {
  classifyCameraStartError,
  evaluateCameraAvailability,
  type CameraEnvironmentProbe,
  type CameraStartFailure,
} from "../scanner/camera-environment";
import { stopAllStreamTracks } from "../scanner/camera-stream-tracks";
import {
  capturePlateFrame,
  clearPlateFrame,
  openPlateCamera,
} from "./plate-camera-browser";

export type PlateCameraPhase = "idle" | "starting" | "preview" | "captured";
export type PlateCameraFailure =
  | CameraStartFailure
  | "insecure-context"
  | "unavailable";
export type PlateCameraState = PlateCameraPhase | PlateCameraFailure;

export interface PlateCameraSessionOptions {
  onState(state: PlateCameraState): void;
  openCamera?(video: HTMLVideoElement): Promise<MediaStream>;
  probeEnvironment(): CameraEnvironmentProbe;
}

/** Owns one transient still-capture lifecycle. No image leaves the canvas. */
export class PlateCameraSession {
  private canvas: HTMLCanvasElement | null = null;
  private generation = 0;
  private phase: PlateCameraPhase = "idle";
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;

  constructor(private readonly options: PlateCameraSessionOptions) {}

  getPhase(): PlateCameraPhase {
    return this.phase;
  }

  async begin(video: HTMLVideoElement): Promise<void> {
    if (this.phase !== "idle") return;
    this.setPhase("starting");
    const generation = ++this.generation;
    const probe = this.options.probeEnvironment();
    const availability = probe.isSecureContext
      ? evaluateCameraAvailability(probe)
      : "insecure-context";
    if (availability !== "supported") {
      this.phase = "idle";
      this.options.onState(availability);
      return;
    }

    try {
      const stream = await (this.options.openCamera ?? openPlateCamera)(video);
      if (generation !== this.generation || this.getPhase() !== "starting") {
        stopAllStreamTracks(stream);
        if (video.srcObject === stream) video.srcObject = null;
        return;
      }
      this.stream = stream;
      this.video = video;
      this.setPhase("preview");
    } catch (error) {
      if (generation !== this.generation || this.getPhase() !== "starting") {
        return;
      }
      this.releaseStream();
      this.phase = "idle";
      this.options.onState(classifyCameraStartError(error));
    }
  }

  capture(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
    if (this.phase !== "preview") return;
    try {
      clearPlateFrame(canvas);
      capturePlateFrame(video, canvas);
      this.canvas = canvas;
      this.generation += 1;
      this.releaseStream();
      this.setPhase("captured");
    } catch {
      this.generation += 1;
      this.releaseStream();
      clearPlateFrame(canvas);
      this.phase = "idle";
      this.options.onState("error");
    }
  }

  close(): void {
    this.generation += 1;
    this.releaseStream();
    clearPlateFrame(this.canvas);
    this.canvas = null;
    this.setPhase("idle");
  }

  private releaseStream(): void {
    const stream = this.stream;
    this.stream = null;
    if (stream !== null) stopAllStreamTracks(stream);
    if (this.video?.srcObject === stream) this.video.srcObject = null;
    this.video = null;
  }

  private setPhase(phase: PlateCameraPhase): void {
    this.phase = phase;
    this.options.onState(phase);
  }
}
