import { useState } from "react";
import { Text, View } from "react-native";
import type {
  ConditionPhotoSnapshot,
  EmployeeConditionPhotoSession,
  EmployeeLocale,
} from "@valet/employee-client";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { CheckInButton } from "./native-check-in-primitives";
import { checkInStylesTheme as sTheme } from "./native-check-in-styles";
import { NativeConditionPhotoCamera } from "./native-condition-photo-camera";
import { nativeConditionPhotoCopy } from "./native-condition-photo-copy";
import type { NativeConditionPhotoFiles } from "./native-condition-photo-files";
import { conditionPhotoScopeKey } from "@valet/employee-client";
import { NativeConditionPhotoB1Slots, b1Slots } from "./native-condition-photo-b1-slots";
import { nativeConditionPhotoB1Styles as b1Theme } from "./native-condition-photo-b1-styles";

export function NativeConditionPhotoStatus({
  files, locale, photo, snapshot, onPrepareCapture, onReleaseCapture,
}: {
  readonly files: NativeConditionPhotoFiles;
  readonly locale: EmployeeLocale;
  readonly photo: EmployeeConditionPhotoSession;
  readonly snapshot: ConditionPhotoSnapshot;
  readonly onPrepareCapture?: ((handle: string) => Promise<string | null>) | undefined;
  readonly onReleaseCapture?: ((handle: string) => void) | undefined;
}) {
  const styles = useEmployeeStyles(sTheme);
  const b1Styles = useEmployeeStyles(b1Theme);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [brokenUris, setBrokenUris] = useState<readonly string[]>([]);
  const [closeCamera] = useState(() => () => setCameraOpen(false));
  const copy = nativeConditionPhotoCopy(locale);
  const phase = snapshot.phase;
  const status = snapshot.status;
  const slots = b1Slots(snapshot);
  const hasEmpty = slots.some((slot) => slot.phase === "EMPTY");
  const hasLocal = slots.some((slot) => slot.phase === "CAPTURED_LOCAL");
  const selectedPhase = slots.find((slot) => slot.slotId === selectedSlot)?.phase;
  const canCapture = snapshot.required !== null &&
    phase !== "uploading" && phase !== "pending" && phase !== "unknown" &&
    hasEmpty && status?.status !== "PENDING";
  const message = snapshot.qualifying ? copy.verified :
    phase === "loading" ? copy.policyLoading :
    phase === "captured" ? copy.captured :
    phase === "uploading" ? copy.sending :
    phase === "pending" ? copy.pending :
    phase === "unknown" ? copy.unknown :
    phase === "verified" ? copy.unavailable :
    phase === "rejected" ? copy.rejected :
    phase === "unavailable" ? copy.unavailable :
    snapshot.required ? copy.required : copy.optional;
  return (
    <View style={styles.policyNotice}>
      <Text accessibilityLiveRegion="polite" style={[styles.policyNoticeText,
        { textAlign: "center" }]}>
        {snapshot.required === null ? copy.policyLoading :
          snapshot.required ? copy.required : copy.optional}
      </Text>
      <NativeConditionPhotoB1Slots locale={locale} snapshot={snapshot}
        selectedSlot={selectedSlot} onSelect={setSelectedSlot} notice={message}
        brokenUris={brokenUris} onThumbnailError={(uri) => {
          const now = photo.current();
          if (!snapshot.scope || !now.scope ||
            conditionPhotoScopeKey(now.scope) !== conditionPhotoScopeKey(snapshot.scope) ||
            !now.slots.some((slot) => slot.thumbnailUri === uri)) return;
          setBrokenUris((old) => old.includes(uri) ? old : [...old, uri].slice(-4));
        }} />
      <View style={b1Styles.actions}>
      {canCapture ? (
        <CheckInButton label={copy.open} variant="secondary"
          onPress={() => setCameraOpen(true)} />
      ) : null}
      {hasLocal && phase !== "uploading" && phase !== "pending" && phase !== "unknown" ? (
        <CheckInButton label={copy.confirm} onPress={() => void photo.upload()} />
      ) : null}
      {(selectedPhase === "CAPTURED_LOCAL" || selectedPhase === "UPLOAD_FAILED") &&
        phase !== "uploading" && phase !== "pending" && phase !== "unknown" ? (
        <CheckInButton label={copy.retake} variant="secondary"
          onPress={() => { if (photo.retake(selectedSlot)) setCameraOpen(true); }} />
      ) : null}
      {phase === "unknown" || phase === "unavailable" || phase === "pending" ||
        (phase === "verified" && !snapshot.qualifying) ? (
        <CheckInButton label={copy.check} variant="secondary"
          onPress={() => void photo.checkServer()} />
      ) : null}
      {status?.status === "PENDING" && phase === "pending" &&
        status.retryAction === "RECONCILE" ? (
          <CheckInButton label={copy.reconcile} variant="secondary"
            onPress={() => void photo.reconcile()} />
        ) : null}
      {status?.status === "PENDING" && phase === "pending" &&
        status.retryAction === "RESEND_SAME_BYTES" &&
        slots.some((slot) => slot.operationId === status.operationId &&
          slot.hasCapture && slot.phase === "UPLOAD_PENDING") ? (
          <CheckInButton label={copy.resend} variant="secondary"
            onPress={() => void photo.upload()} />
        ) : null}
      </View>
      {cameraOpen ? (
        <NativeConditionPhotoCamera files={files} locale={locale} photo={photo}
          onClose={closeCamera} onPrepareCapture={onPrepareCapture}
          onReleaseCapture={onReleaseCapture} />
      ) : null}
    </View>
  );
}
