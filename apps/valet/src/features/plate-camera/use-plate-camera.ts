import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  probeCameraEnvironment,
  type CameraEnvironmentProbe,
} from "../scanner/camera-environment";
import {
  PlateCameraSession,
  type PlateCameraState,
} from "./plate-camera-session";

export interface PlateCameraOptions {
  identityKey?: string | null | undefined;
  openCamera?(video: HTMLVideoElement): Promise<MediaStream>;
  probeEnvironment?: (() => CameraEnvironmentProbe) | undefined;
}

export interface PlateCameraHandle {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly state: PlateCameraState;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  capture(): void;
  close(): void;
  retake(): void;
  start(): void;
}

export function usePlateCamera(
  options: PlateCameraOptions = {},
): PlateCameraHandle {
  const [state, setState] = useState<PlateCameraState>("idle");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<PlateCameraSession | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  const ensureSession = useCallback((): PlateCameraSession => {
    const existing = sessionRef.current;
    if (existing !== null) return existing;
    const session = new PlateCameraSession({
      onState: setState,
      openCamera: (video) => {
        const open = optionsRef.current.openCamera;
        return open === undefined
          ? import("./plate-camera-browser").then(({ openPlateCamera }) =>
              openPlateCamera(video),
            )
          : open(video);
      },
      probeEnvironment: () =>
        (optionsRef.current.probeEnvironment ?? probeCameraEnvironment)(),
    });
    sessionRef.current = session;
    return session;
  }, []);

  const start = useCallback((): void => {
    ensureSession();
    setState("starting");
  }, [ensureSession]);

  useEffect(() => {
    if (state !== "starting") return;
    const video = videoRef.current;
    if (video === null) return;
    const session = ensureSession();
    if (session.getPhase() !== "idle") return;
    void session.begin(video);
  }, [ensureSession, state]);

  const capture = useCallback((): void => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video === null || canvas === null) return;
    ensureSession().capture(video, canvas);
  }, [ensureSession]);

  const close = useCallback((): void => {
    sessionRef.current?.close();
    if (sessionRef.current === null) setState("idle");
  }, []);

  const retake = useCallback((): void => {
    ensureSession().close();
    setState("starting");
  }, [ensureSession]);

  useEffect(() => () => {
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  const identityKey = options.identityKey;
  const firstIdentityRef = useRef(true);
  useEffect(() => {
    if (firstIdentityRef.current) {
      firstIdentityRef.current = false;
      return;
    }
    close();
  }, [close, identityKey]);

  return { canvasRef, capture, close, retake, start, state, videoRef };
}
