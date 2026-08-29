/**
 * React adapter over QrScanSession (DEC-067). Thin by design: all lifecycle
 * guarantees live in the session controller; this hook binds it to a preview
 * <video> element, exposes truthful UI states, and releases every camera
 * resource on unmount (route change / workflow exit) and on authentication
 * identity change while mounted.
 */

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
} from "./camera-environment";
import {
  QrScanSession,
  type QrInterpretResult,
  type QrScanFailureState,
} from "./qr-scan-session";
import { openZxingQrCamera } from "./zxing-camera-opener";

export type QrScannerUiState =
  | "idle"
  | "starting"
  | "scanning"
  | QrScanFailureState;

export interface QrScannerCaptureOptions<TValue> {
  /** Maps decoded text onto a typed value or a rejection reason. */
  interpret(text: string): QrInterpretResult<TValue>;
  /** Invoked exactly once per accepted decode; camera already stopped. */
  onDecoded(value: TValue): void;
  /**
   * When this key changes (authentication identity change), the camera is
   * closed immediately; stale identity never keeps capture running.
   */
  identityKey?: string | null | undefined;
  /** Test seam: environment probe override. */
  probeEnvironment?: (() => CameraEnvironmentProbe) | undefined;
}

export interface QrScannerCaptureHandle {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly uiState: QrScannerUiState;
  readonly rejectionReason: string | null;
  start(): Promise<void>;
  close(): void;
}

export function useQrScannerCapture<TValue>(
  options: QrScannerCaptureOptions<TValue>,
): QrScannerCaptureHandle {
  const [uiState, setUiState] = useState<QrScannerUiState>("idle");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<QrScanSession<TValue> | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  const ensureSession = useCallback((): QrScanSession<TValue> => {
    const existing = sessionRef.current;
    if (existing !== null) return existing;
    const session = new QrScanSession<TValue>({
      interpret: (text) => optionsRef.current.interpret(text),
      openCamera: async (onText) => {
        const video = videoRef.current;
        if (video === null) {
          throw new Error("QR scanner preview element is not mounted");
        }
        return openZxingQrCamera({ onText, video });
      },
      onAccepted: (value) => {
        setRejectionReason(null);
        setUiState("idle");
        optionsRef.current.onDecoded(value);
      },
      onFailure: (state) => {
        setUiState(state);
      },
      onPhase: (phase) => {
        if (phase === "starting") setUiState("starting");
        if (phase === "scanning") setUiState("scanning");
      },
      onRejected: (reason) => {
        setRejectionReason(reason);
      },
      previewStream: () => videoRef.current?.srcObject ?? null,
      probeEnvironment:
        options.probeEnvironment ?? probeCameraEnvironment,
    });
    sessionRef.current = session;
    return session;
  }, [options.probeEnvironment]);

  const start = useCallback(async (): Promise<void> => {
    const session = ensureSession();
    session.armNextScan();
    setRejectionReason(null);
    setUiState("starting");
  }, [ensureSession]);

  // ResourceQrScanSection and HandoffQrScanSection mount the preview only in
  // non-idle states. Opening the camera in start() races that React commit and
  // observes a null videoRef; effects run after the preview ref is attached.
  useEffect(() => {
    if (uiState !== "starting") return;
    const session = ensureSession();
    if (session.getPhase() !== "idle") return;
    void session.begin();
  }, [ensureSession, uiState]);

  const close = useCallback((): void => {
    const session = sessionRef.current;
    if (session === null) return;
    session.close();
    setUiState("idle");
    setRejectionReason(null);
  }, []);

  // Unmount cleanup covers route change away from the workflow and any
  // workflow completion that stops rendering the capturing step.
  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  // Authentication identity change while mounted must stop capture.
  const identityKey = options.identityKey;
  const firstIdentityRef = useRef(true);
  useEffect(() => {
    if (firstIdentityRef.current) {
      firstIdentityRef.current = false;
      return;
    }
    close();
  }, [close, identityKey]);

  return { close, rejectionReason, start, uiState, videoRef };
}
