import { useEffect } from "react";
import type {
  EmployeeShiftEndSession,
  EmployeeShiftEndSnapshot,
  NativeAuthSession,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import {
  EmployeeAppHeader,
  EmployeeFrame,
} from "../employee-ui/employee-frame";
import {
  getFoundationPresentation,
  type FoundationLocale,
} from "../foundation/foundation-locale";
import { NativeActiveHeaderUtilities } from "../shell/native-active-header-utilities";
import type { NativePushSnapshot } from "../notifications/native-push-types";
import { NativeActiveShiftPanel } from "./native-active-shift-panel";

export function NativeShiftDetachedScreen({
  locale,
  onRequestNotificationPermission,
  onReviewTasks,
  onSelectLocale,
  pushSnapshot,
  session,
  snapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly authSnapshot: NativeAuthSnapshot;
  readonly locale: FoundationLocale;
  readonly onRequestNotificationPermission: () => Promise<void>;
  readonly onReviewTasks: () => void;
  readonly onSelectLocale: (locale: FoundationLocale) => void;
  readonly pushSnapshot: NativePushSnapshot;
  readonly session: EmployeeShiftEndSession;
  readonly snapshot: EmployeeShiftEndSnapshot;
}) {
  const presentation = getFoundationPresentation(locale);
  const authority = snapshot.authority;
  useEffect(() => {
    if (snapshot.phase === "ended") session.acknowledgeEndedPresentation();
  }, [session, snapshot.phase]);
  if (authority === null) return null;
  return (
    <EmployeeFrame direction={presentation.direction}>
      <EmployeeAppHeader
        scope={authority}
        textAlign={presentation.textAlign}
        utilities={
          <NativeActiveHeaderUtilities
            locale={locale}
            onRequestNotificationPermission={onRequestNotificationPermission}
            onSelectLocale={onSelectLocale}
            pushSnapshot={pushSnapshot}
            scope={authority}
          />
        }
      />
      <NativeActiveShiftPanel
        locale={locale}
        onReviewTasks={onReviewTasks}
        session={session}
        snapshot={snapshot}
        textAlign={presentation.textAlign}
      />
    </EmployeeFrame>
  );
}
