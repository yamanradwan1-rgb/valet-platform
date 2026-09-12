import { View } from "react-native";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeGuestAccessScreen } from "../guest-access/native-guest-access-screen";
import { copyNativeGuestAccessUrl } from "../guest-access/native-guest-access-clipboard";
import type { NativeGuestAccessSnapshot } from "../guest-access/native-guest-access-types";
import { NativeIncidentScreen } from "../incident/native-incident-screen";
import type { NativeIncidentSnapshot } from "../incident/native-incident-types";
import type { NativeContextualRoute } from "./native-contextual-route";
import type { EmployeeConnectivityStatus } from "@valet/employee-client";

export function NativeContextualSurface({
  connectivity,
  guestAccess,
  incident,
  locale,
  onClose,
  route,
  runtime,
}: {
  readonly connectivity: EmployeeConnectivityStatus;
  readonly guestAccess: NativeGuestAccessSnapshot;
  readonly incident: NativeIncidentSnapshot;
  readonly locale: FoundationLocale;
  readonly onClose: () => void;
  readonly route: NativeContextualRoute | null;
  readonly runtime: NativeEmployeeRuntime;
}) {
  if (route === null) return null;
  return (
    <View
      style={{ backgroundColor: "#FAFAF8", flex: 1 }}
      testID="native-contextual-workflow"
    >
      {route.kind === "incident" ? (
        <NativeIncidentScreen
          locale={locale}
          onClose={onClose}
          session={runtime.incident}
          snapshot={incident}
        />
      ) : (
        <NativeGuestAccessScreen
          configInvalid={!runtime.guestAccess.hasValidCustomerOrigin()}
          credentialUrl={runtime.guestAccess.freshCredentialUrl()}
          locale={locale}
          onClose={onClose}
          onCopy={() =>
            copyNativeGuestAccessUrl(runtime.guestAccess.freshCredentialUrl())
          }
          onIssue={() => void runtime.guestAccess.issue()}
          online={connectivity !== "offline"}
          session={runtime.guestAccess}
          snapshot={guestAccess}
        />
      )}
    </View>
  );
}
