import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, CameraView } from "expo-camera";
import { AppState, Image, Linking, Modal, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { EmployeeConditionPhotoSession, EmployeeLocale } from "@valet/employee-client";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { stylesTheme } from "../foundation/foundation-styles";
import type { NativeConditionPhotoFiles } from "./native-condition-photo-files";
import { nativeConditionPhotoCopy } from "./native-condition-photo-copy";
import { photoOpening, photoOpeningIsCurrent } from "./native-condition-photo-scope";
import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import { observePhotoStage, observePhotoStageAsync,
  type NativePhotoStageObserver } from "./native-photo-stage";

export function NativeConditionPhotoCamera({
  files, locale, onClose, onPrepareCapture, onReleaseCapture, photo,
}: {
  readonly files: NativeConditionPhotoFiles;
  readonly locale: EmployeeLocale;
  readonly onClose: () => void;
  /** Builds a private display thumbnail before the upload JPEG can be discarded. */
  readonly onPrepareCapture?: ((handle: string) => Promise<string | null>) | undefined;
  /** Disposes a prepared thumbnail if its camera capture was not accepted. */
  readonly onReleaseCapture?: ((handle: string) => void) | undefined;
  readonly photo: EmployeeConditionPhotoSession;
}) {
  const s = useEmployeeStyles(stylesTheme);
  const copy = nativeConditionPhotoCopy(locale);
  const camera = useRef<CameraView>(null);
  const inFlight = useRef(false);
  const confirming = useRef(false);
  const revision = useRef(0);
  const [permission, setPermission] = useState<"loading" | "granted" | "denied">("loading");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [handle, setHandle] = useState<string | null>(null);
  const ownedHandle = useRef<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const photoState = useSyncExternalStore(photo.subscribe, photo.current);
  const [opening] = useState(() => photoOpening(photo.current()));
  const active = useCallback(() =>
    photoOpeningIsCurrent(opening, photo.current()), [photo, opening]);
  const release = useCallback(() => {
    const previous = ownedHandle.current;
    ownedHandle.current = null;
    if (previous !== null) {
      onReleaseCapture?.(previous);
      void files.discard(previous).catch(() => undefined);
    }
  }, [files, onReleaseCapture]);
  const dismiss = useCallback(() => {
    revision.current += 1;
    release();
    onClose();
  }, [release, onClose]);

  useEffect(() => {
    if (!photoOpeningIsCurrent(opening, photoState))
      dismiss();
  }, [photoState, opening, dismiss]);

  useEffect(() => {
    let mounted = true;
    void Camera.getCameraPermissionsAsync()
      .then(async (prior) => prior.granted ? prior :
        prior.canAskAgain ? Camera.requestCameraPermissionsAsync() : prior)
      .then((result) => {
        if (mounted) {
          setPermission(result.granted ? "granted" : "denied");
          setCanAskAgain(result.canAskAgain);
        }
      })
      .catch(() => { if (mounted) setPermission("denied"); });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") dismiss();
    });
    return () => {
      mounted = false;
      revision.current += 1;
      release();
      subscription.remove();
    };
  }, [dismiss, release]);

  const take = async () => {
    if (permission !== "granted" || !ready || inFlight.current || !active()) return;
    const pinned = getNativeTelemetry().pinned;
    const token = pinned.begin("photo");
    if (!files.canCapture()) {
      pinned.stage("photo", token, "cleanup", "error");
      pinned.complete("photo", token, "failed", "not-attempted");
      setError(true);
      return;
    }
    const observe: NativePhotoStageObserver = (stage, outcome) =>
      pinned.stage("photo", token, stage, outcome);
    pinned.stage("photo", token, "camera-readiness", "success");
    inFlight.current = true;
    setBusy(true);
    const stamp = ++revision.current;
    setError(false);
    let rawWasHandled = false;
    let captureStarted = false;
    try {
      files.beginCapture();
      captureStarted = true;
      const picture = await observePhotoStageAsync(observe, "camera-capture",
        async () => camera.current?.takePictureAsync({
          quality: 0.8, exif: false, base64: false, skipProcessing: false,
        }));
      observePhotoStage(observe, "camera-result", () => {
        if (!picture?.uri) throw new Error("CONDITION_PHOTO_CAPTURE_UNAVAILABLE");
      });
      if (!picture) throw new Error("CONDITION_PHOTO_CAPTURE_UNAVAILABLE");
      if (stamp !== revision.current || !active()) {
        rawWasHandled = true;
        files.discardCapturedCameraSource(picture.uri);
        pinned.cancel("photo", token);
        return;
      }
      rawWasHandled = true;
      const owned = await files.capture(picture.uri, picture.width, picture.height, observe);
      if (stamp !== revision.current || !active()) {
        await files.discard(owned);
        pinned.cancel("photo", token);
        return;
      }
      let ownedPreview: string;
      try {
        ownedPreview = observePhotoStage(observe, "preview", () => files.preview(owned));
      } catch (cause) {
        await files.discard(owned).catch(() => undefined);
        throw cause;
      }
      ownedHandle.current = owned;
      setHandle(owned);
      setPreviewUri(ownedPreview);
      pinned.complete("photo", token, "success", "not-attempted");
    } catch {
      if (stamp === revision.current && active()) {
        pinned.complete("photo", token, "failed", "not-attempted");
        setError(true);
      } else {
        pinned.cancel("photo", token);
      }
    } finally {
      if (rawWasHandled) {
        try { files.finishCapture(); } catch { setError(true); }
      } else if (captureStarted) {
        try { files.resolveUnknownCapture(); } catch { setError(true); }
      }
      inFlight.current = false;
      setBusy(false);
    }
  };

  const retake = () => {
    if (!handle) return;
    const previous = handle;
    revision.current += 1;
    ownedHandle.current = null;
    onReleaseCapture?.(previous);
    setHandle(null);
    setPreviewUri(null);
    setReady(false);
    setCameraKey((value) => value + 1);
    const revisionStamp = revision.current;
    void files.discard(previous).catch(() => {
      if (revision.current !== revisionStamp || !active()) return;
      const pinned = getNativeTelemetry().pinned;
      const token = pinned.begin("photo");
      pinned.stage("photo", token, "cleanup", "error");
      pinned.complete("photo", token, "failed", "not-attempted");
      setError(true);
    });
  };

  const confirm = async () => {
    if (handle === null || !active() || confirming.current) return;
    confirming.current = true;
    setBusy(true);
    try {
      const thumbnailUri = await onPrepareCapture?.(handle) ?? null;
      if (!active() || ownedHandle.current !== handle) return;
      if (!photo.capture(handle, thumbnailUri)) return;
      ownedHandle.current = null;
      setHandle(null);
      setPreviewUri(null);
      onClose();
    } catch {
      if (active()) setError(true);
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal animationType="slide" onRequestClose={dismiss} presentationStyle="fullScreen">
      <SafeAreaView style={s.safeArea}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14,
          direction: locale === "ar" ? "rtl" : "ltr" }}>
          <Text accessibilityRole="header" style={[s.taskHeading,
            { textAlign: locale === "ar" ? "right" : "left" }]}>{copy.open}</Text>
          <EmployeeButton label={copy.close} onPress={dismiss} variant="secondary" />
          {permission === "granted" && handle === null ? (
            <CameraView key={cameraKey} ref={camera} facing="back"
              mute style={{ height: 220 }} accessible={false}
              onCameraReady={() => setReady(true)}
              onMountError={() => {
                if (!active() || inFlight.current || handle !== null) return;
                const pinned = getNativeTelemetry().pinned;
                const token = pinned.begin("photo");
                pinned.stage("photo", token, "camera-readiness", "error");
                pinned.complete("photo", token, "failed", "not-attempted");
                setReady(false); setError(true);
              }} />
          ) : null}
          {handle !== null && previewUri !== null ? (
            <Image source={{ uri: previewUri }} style={{ height: 220 }}
              resizeMode="contain" accessibilityLabel={copy.captured}
              onError={() => {
                if (!active() || handle !== ownedHandle.current) return;
                const pinned = getNativeTelemetry().pinned;
                const token = pinned.begin("photo");
                pinned.stage("photo", token, "preview", "error");
                pinned.complete("photo", token, "failed", "not-attempted");
                setError(true);
              }} />
          ) : null}
          {permission === "denied" ? (
            <Text accessibilityLiveRegion="polite" style={s.errorText}>{copy.permission}</Text>
          ) : null}
          {error ? <Text accessibilityLiveRegion="polite" style={s.errorText}>
            {copy.cameraFailure}</Text> : null}
          {handle === null ? (
            <EmployeeButton disabled={!ready || permission !== "granted" || busy}
              label={copy.capture} onPress={() => void take()} />
          ) : (
            <>
              <Text accessibilityLiveRegion="polite" style={s.taskStatus}>{copy.captured}</Text>
              <EmployeeButton label={copy.retake} onPress={retake} variant="secondary" />
              <EmployeeButton label={copy.confirm} disabled={busy}
                onPress={() => void confirm()} />
            </>
          )}
          {permission === "denied" && !canAskAgain ? (
            <EmployeeButton label={copy.settings} variant="secondary"
              onPress={() => void Linking.openSettings().catch(() => undefined)} />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
