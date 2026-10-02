import type {
  EmployeeLocale,
  EmployeeOperationalScope,
} from "@valet/employee-client";
import type { NativePushSnapshot } from "../notifications/native-push-types";
import { NativeAccountMenu } from "./native-account-menu";
import { nativeAccountAvatarStyles } from "./native-account-menu-styles";

export { NativeAccountMenu } from "./native-account-menu";
export const nativeActiveHeaderStyles = nativeAccountAvatarStyles;

export function NativeActiveHeaderUtilities({
  locale,
  onRequestNotificationPermission,
  onSelectLocale,
  pushSnapshot,
  scope,
}: {
  readonly locale: EmployeeLocale;
  readonly onRequestNotificationPermission: () => Promise<void>;
  readonly onSelectLocale: (locale: EmployeeLocale) => void;
  readonly pushSnapshot: NativePushSnapshot;
  readonly scope: EmployeeOperationalScope;
}) {
  return (
    <NativeAccountMenu
      locale={locale}
      onRequestNotificationPermission={onRequestNotificationPermission}
      onSelectLocale={onSelectLocale}
      pushSnapshot={pushSnapshot}
      scope={scope}
    />
  );
}
