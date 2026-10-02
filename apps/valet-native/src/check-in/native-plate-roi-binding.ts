import type { CameraView } from "expo-camera";
import type { NativePlateCameraController } from "./native-plate-camera-controller";
import { plateGuide, type PlateRoiGeometry } from "./native-plate-roi-geometry";
import {
  readPlatePreview,
  type PlatePreviewMetadata,
} from "./native-plate-roi-metadata";

interface ReadyGeometry {
  readonly geometry: PlateRoiGeometry;
  readonly preview: PlatePreviewMetadata;
  readonly camera: CameraView;
}

/** Native-only mount/layout ownership; nothing enters Check-In workflow state. */
export class NativePlateRoiBinding {
  private camera: CameraView | null = null;
  private cameraMount = -1;
  private geometry: PlateRoiGeometry | undefined;
  private validated: ReadyGeometry | undefined;
  private readyMount = -1;
  private revision = 0;
  private reading = 0;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly controller: NativePlateCameraController) {
    controller.subscribe(() => {
      const current = controller.current();
      if (
        (current.phase === "starting" || current.phase === "preview") &&
        (this.cameraMount === -1 || this.cameraMount === current.mountId) &&
        (!this.geometry || this.geometry.generation === current.generation)
      )
        return;
      this.camera = null;
      this.cameraMount = -1;
      this.readyMount = -1;
      this.validated = undefined;
      this.geometry = undefined;
      this.reading += 1;
      this.listeners.forEach((listener) => listener());
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  current = () => this.geometry;

  cameraFor(generation: number, mountId: number): CameraView | null {
    return this.isMount(generation, mountId) && this.cameraMount === mountId
      ? this.camera
      : null;
  }

  isMount(generation: number, mountId: number): boolean {
    const current = this.controller.current();
    return (
      current.generation === generation &&
      current.mountId === mountId &&
      (current.phase === "starting" || current.phase === "preview")
    );
  }

  ref(value: CameraView | null, generation: number, mountId: number): void {
    if (!this.isMount(generation, mountId)) return;
    if (this.camera !== value || this.cameraMount !== mountId) {
      this.validated = undefined;
      this.readyMount = -1;
      this.reading += 1;
    }
    this.camera = value;
    this.cameraMount = mountId;
  }

  layout(
    generation: number,
    mountId: number,
    width: number,
    height: number,
  ): void {
    if (!this.isMount(generation, mountId)) return;
    if (
      this.geometry?.mountId === mountId &&
      this.geometry.width === width &&
      this.geometry.height === height
    )
      return;
    let guide;
    try {
      guide = plateGuide(width, height);
    } catch {
      this.controller.geometryUnavailable(generation);
      return;
    }
    const changedDuringPreview = this.controller.current().phase === "preview";
    this.validated = undefined;
    this.reading += 1;
    this.geometry = {
      generation,
      mountId,
      revision: ++this.revision,
      width,
      height,
      guide,
    };
    this.listeners.forEach((listener) => listener());
    if (changedDuringPreview) {
      this.controller.geometryUnavailable(generation);
      return;
    }
    void this.validate();
  }

  async ready(generation: number, mountId: number): Promise<void> {
    if (!this.isMount(generation, mountId) || this.cameraMount !== mountId)
      return;
    this.readyMount = mountId;
    await this.validate();
  }

  capture(): ReadyGeometry {
    const value = this.validated;
    if (!value || !this.isCurrent(value))
      throw new Error("Plate mapping unavailable.");
    return value;
  }

  isCurrent(value: ReadyGeometry): boolean {
    return (
      this.isMount(value.geometry.generation, value.geometry.mountId) &&
      this.camera === value.camera &&
      this.geometry === value.geometry &&
      this.validated === value
    );
  }

  private async validate(): Promise<void> {
    const geometry = this.geometry;
    const camera = this.camera;
    if (
      !geometry ||
      !camera ||
      this.readyMount !== geometry.mountId ||
      this.cameraMount !== geometry.mountId ||
      !this.isMount(geometry.generation, geometry.mountId) ||
      this.controller.current().phase !== "starting"
    )
      return;
    const reading = ++this.reading;
    try {
      const preview = await readPlatePreview(camera);
      if (
        reading !== this.reading ||
        !this.isMount(geometry.generation, geometry.mountId) ||
        camera !== this.camera ||
        geometry !== this.geometry
      )
        return;
      this.validated = { geometry, camera, preview };
      this.controller.ready(geometry.generation);
    } catch {
      if (
        reading === this.reading &&
        this.isMount(geometry.generation, geometry.mountId)
      )
        this.controller.geometryUnavailable(geometry.generation);
    }
  }
}
