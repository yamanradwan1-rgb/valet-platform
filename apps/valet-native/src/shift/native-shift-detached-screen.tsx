import type {
  EmployeeShiftEndSession,
  EmployeeShiftEndSnapshot,
  NativeAuthSession,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import { getNativeAuthCopy } from "../auth/native-auth-copy";
import { NativeAuthPanel } from "../auth/native-auth-panel";
import {
  EmployeeAppHeader,
  EmployeeFrame,
} from "../employee-ui/employee-frame";
import {
  getFoundationPresentation,
  type FoundationLocale,
} from "../foundation/foundation-locale";
import { NativeLocaleButton } from "../shell/native-locale-button";
import { getNativeShellCopy } from "../shell/native-shell-copy";
import { NativeActiveShiftPanel } from "./native-active-shift-panel";

export function NativeShiftDetachedScreen({
  auth,
  authSnapshot,
  locale,
  onRefresh,
  onReviewTasks,
  onSelectLocale,
  session,
  snapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly authSnapshot: NativeAuthSnapshot;
  readonly locale: FoundationLocale;
  readonly onRefresh: () => void;
  readonly onReviewTasks: () => void;
  readonly onSelectLocale: (locale: FoundationLocale) => void;
  readonly session: EmployeeShiftEndSession;
  readonly snapshot: EmployeeShiftEndSnapshot;
}) {
  const presentation = getFoundationPresentation(locale);
  const shellCopy = getNativeShellCopy(locale);
  const authority = snapshot.authority;
  if (authority === null) return null;
  return (
    <EmployeeFrame direction={presentation.direction}>
      <EmployeeAppHeader
        scope={authority}
        textAlign={presentation.textAlign}
        utilities={
          <>
            <NativeLocaleButton
              code={locale === "en" ? "AR" : "EN"}
              label={locale === "en" ? shellCopy.arabic : shellCopy.english}
              onPress={() => onSelectLocale(locale === "en" ? "ar" : "en")}
            />
            <NativeAuthPanel
              compact
              copy={getNativeAuthCopy(locale)}
              session={auth}
              snapshot={authSnapshot}
              textAlign={presentation.textAlign}
            />
          </>
        }
      />
      <NativeActiveShiftPanel
        locale={locale}
        onReturned={onRefresh}
        onReviewTasks={onReviewTasks}
        session={session}
        snapshot={snapshot}
        textAlign={presentation.textAlign}
      />
    </EmployeeFrame>
  );
}
