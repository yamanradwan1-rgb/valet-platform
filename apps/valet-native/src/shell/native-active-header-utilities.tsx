import type {
  EmployeeLocale,
  EmployeeOperationalScope,
} from "@valet/employee-client";
import type { NativePushSnapshot } from "../notifications/native-push-types";
import { NativeAccountMenu } from "./native-account-menu";
import { nativeAccountAvatarStyles } from "./native-account-menu-styles";

export { NativeAccountMenu } from "./native-account-menu";
export const nativeActiveHeaderStyles = nativeAccountAvatarStyles;

export function nativeRoleInitials(role: string): "VE" | "VS" | null {
  if (role === "VALET_EMPLOYEE") return "VE";
  if (role === "VALET_SUPERVISOR") return "VS";
  return null;
}

/** Uses a real display name when one is already available; no identity read is added. */
export function nativeEmployeeInitials(
  displayName: string | null | undefined,
  role: string,
): string | null {
  const parts = displayName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase();
  if (parts.length > 1)
    return `${parts[0]![0] ?? ""}${parts.at(-1)![0] ?? ""}`.toLocaleUpperCase();
  return nativeRoleInitials(role);
}

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
      initials={nativeEmployeeInitials(undefined, scope.role)}
      locale={locale}
      onRequestNotificationPermission={onRequestNotificationPermission}
      onSelectLocale={onSelectLocale}
      pushSnapshot={pushSnapshot}
      scope={scope}
    />
  );
}
