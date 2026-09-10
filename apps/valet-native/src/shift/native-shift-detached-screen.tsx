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
import { NativeActiveShiftPanel } from "./native-active-shift-panel";

export function NativeShiftDetachedScreen({
  locale,
  onReviewTasks,
  onSelectLocale,
  session,
  snapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly authSnapshot: NativeAuthSnapshot;
  readonly locale: FoundationLocale;
  readonly onReviewTasks: () => void;
  readonly onSelectLocale: (locale: FoundationLocale) => void;
  readonly session: EmployeeShiftEndSession;
  readonly snapshot: EmployeeShiftEndSnapshot;
}) {
  const presentation = getFoundationPresentation(locale);
  const authority = snapshot.authority;
  if (authority === null) return null;
  return (
    <EmployeeFrame direction={presentation.direction}>
      <EmployeeAppHeader
        scope={authority}
        textAlign={presentation.textAlign}
        utilities={
          <NativeActiveHeaderUtilities
            locale={locale}
            onSelectLocale={onSelectLocale}
            role={authority.role}
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
