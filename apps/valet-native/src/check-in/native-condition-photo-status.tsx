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

export function NativeConditionPhotoStatus({
  files, locale, photo, snapshot,
}: {
  readonly files: NativeConditionPhotoFiles;
  readonly locale: EmployeeLocale;
  readonly photo: EmployeeConditionPhotoSession;
  readonly snapshot: ConditionPhotoSnapshot;
}) {
  const styles = useEmployeeStyles(sTheme);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [closeCamera] = useState(() => () => setCameraOpen(false));
  const copy = nativeConditionPhotoCopy(locale);
  const phase = snapshot.phase;
  const status = snapshot.status;
  const canCapture = snapshot.required !== null &&
    phase !== "uploading" && phase !== "pending" && phase !== "unknown" &&
    !snapshot.qualifying;
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
        { textAlign: "center" }]}>{message}</Text>
      {canCapture ? (
        <CheckInButton label={copy.open} variant="secondary"
          onPress={() => setCameraOpen(true)} />
      ) : null}
      {phase === "captured" ? (
        <CheckInButton label={copy.confirm} onPress={() => void photo.upload()} />
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
        status.retryAction === "RESEND_SAME_BYTES" && snapshot.hasCapture ? (
          <CheckInButton label={copy.resend} variant="secondary"
            onPress={() => void photo.upload()} />
        ) : null}
      {cameraOpen ? (
        <NativeConditionPhotoCamera files={files} locale={locale} photo={photo}
          onClose={closeCamera} />
      ) : null}
    </View>
  );
}
