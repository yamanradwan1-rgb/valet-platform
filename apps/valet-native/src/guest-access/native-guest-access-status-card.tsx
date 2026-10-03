import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Text, View } from "react-native";
import { EmployeeBadge } from "../employee-ui/employee-feedback";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeGuestAccessCopy } from "./native-guest-access-copy";
import { NativeGuestAccessQr } from "./native-guest-access-qr";
import { nativeGuestAccessStylesTheme as sTheme } from "./native-guest-access-styles";
import type { NativeGuestAccessSnapshot } from "./native-guest-access-types";

export function NativeGuestAccessStatusCard({
  copyFeedback,
  credentialUrl,
  locale,
  onCopy,
  snapshot,
  suppressCredentialSurfaces,
}: {
  readonly copyFeedback: "copied" | "failed" | null;
  readonly credentialUrl: string | null;
  readonly locale: FoundationLocale;
  readonly onCopy: () => void;
  readonly snapshot: NativeGuestAccessSnapshot;
  readonly suppressCredentialSurfaces: boolean;
}) {
  const s = useEmployeeStyles(sTheme);

  const copy = getNativeGuestAccessCopy(locale);
  const align = locale === "ar" ? "right" : "left";
  if (snapshot.status === null) return null;

  if (
    snapshot.status === "ACTIVE" &&
    snapshot.credentialFresh &&
    credentialUrl !== null &&
    !suppressCredentialSurfaces
  ) {
    return (
      <View style={s.card}>
        <View style={s.statusRow}>
          <Text style={[s.cardTitle, { textAlign: "center" }]}>
            {copy.ready}
          </Text>
          <EmployeeBadge
            label={copy.active}
            showDot
            textAlign={align}
            variant="success"
          />
        </View>
        <NativeGuestAccessQr alt={copy.qrAlt} credentialUrl={credentialUrl} />
        <Text style={s.mutedCenter}>{copy.shareHint}</Text>
        <DateRow
          label={copy.expires}
          locale={locale}
          value={snapshot.expiresAt}
        />
        <EmployeeButton
          label={copy.copyLink}
          onPress={onCopy}
          variant="secondary"
        />
        {copyFeedback ? (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole={copyFeedback === "failed" ? "alert" : undefined}
            style={
              copyFeedback === "copied" ? s.feedbackSuccess : s.feedbackError
            }
          >
            {copyFeedback === "copied" ? copy.copied : copy.copyFailed}
          </Text>
        ) : null}
      </View>
    );
  }

  if (snapshot.status === "ACTIVE") {
    return (
      <View style={[s.card, s.cardCompact]}>
        <Text style={[s.cardTitle, employeeTextStyle("human", align)]}>
          {copy.ready}
        </Text>
        <Text style={[s.statusBody, employeeTextStyle("human", align)]}>
          {copy.activeNoLink}
        </Text>
        <DateRow
          label={copy.expires}
          locale={locale}
          value={snapshot.expiresAt}
        />
      </View>
    );
  }

  if (snapshot.status === "EXPIRED") {
    return (
      <View style={[s.card, s.cardCompact]}>
        <Text style={[s.cardTitle, employeeTextStyle("human", align)]}>
          {copy.expired}
        </Text>
        <DateRow
          label={copy.expires}
          locale={locale}
          value={snapshot.expiresAt}
        />
      </View>
    );
  }

  if (snapshot.status === "REVOKED") {
    return (
      <View style={[s.card, s.cardCompact]}>
        <Text style={[s.cardTitle, employeeTextStyle("human", align)]}>
          {copy.revoked}
        </Text>
        <Text style={[s.statusBody, employeeTextStyle("human", align)]}>
          {copy.revokedHint}
        </Text>
        <DateRow
          label={copy.revoked}
          locale={locale}
          value={snapshot.revokedAt}
        />
      </View>
    );
  }

  return (
    <View style={[s.card, s.cardCompact]}>
      <Text style={[s.cardTitle, employeeTextStyle("human", align)]}>
        {copy.title}
      </Text>
      <Text style={[s.statusBody, employeeTextStyle("human", align)]}>
        {copy.notCreated}
      </Text>
    </View>
  );
}

function DateRow({
  label,
  locale,
  value,
}: {
  readonly label: string;
  readonly locale: FoundationLocale;
  readonly value: string | null;
}) {
  const s = useEmployeeStyles(sTheme);

  const formatted =
    value === null
      ? "—"
      : new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value));
  return (
    <View style={s.dividerRow}>
      <Text style={s.statusBody}>{label}</Text>
      <Text style={[s.date, employeeTextStyle("identifier", "left")]}>
        {formatted}
      </Text>
    </View>
  );
}
