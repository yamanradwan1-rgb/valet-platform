import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { EmployeeBackHeader } from "../employee-ui/employee-back-header";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeGuestAccessConfirmSheet } from "./native-guest-access-confirm-sheet";
import { getNativeGuestAccessCopy } from "./native-guest-access-copy";
import type { NativeGuestAccessSession } from "./native-guest-access-session";
import { nativeGuestAccessStyles as s } from "./native-guest-access-styles";
import { NativeGuestAccessStatusCard } from "./native-guest-access-status-card";
import {
  nativeGuestAccessActions,
  type NativeGuestAccessSnapshot,
} from "./native-guest-access-types";

export function NativeGuestAccessScreen({
  configInvalid,
  credentialFresh = false,
  locale,
  onClose,
  onCopy,
  onIssue,
  online,
  session,
  snapshot,
}: {
  readonly configInvalid: boolean;
  readonly credentialFresh?: boolean;
  readonly locale: FoundationLocale;
  readonly onClose: () => void;
  readonly onCopy?: (() => Promise<boolean>) | undefined;
  readonly onIssue?: (() => void) | undefined;
  readonly online?: boolean | undefined;
  readonly session: NativeGuestAccessSession;
  readonly snapshot: NativeGuestAccessSnapshot;
}) {
  const [confirm, setConfirm] = useState<"reissue" | "revoke" | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(
    null,
  );
  const copy = getNativeGuestAccessCopy(locale);
  const align = locale === "ar" ? "right" : "left";
  const direction = locale === "ar" ? "rtl" : "ltr";
  const actions = nativeGuestAccessActions(snapshot.status);
  const busy = snapshot.mutation !== null;
  const mutationBlocked = online === false || busy;
  const primaryBlocked =
    mutationBlocked || configInvalid || onIssue === undefined;

  const handlePrimary = () => {
    if (actions.primary?.confirm) setConfirm("reissue");
    else onIssue?.();
  };
  const primaryLabel = busy
    ? copy.creating
    : actions.primary?.kind === "CREATE"
      ? copy.create
      : actions.primary?.kind === "CREATE_NEW"
        ? copy.createNew
        : copy.reissue;

  return (
    <>
      <EmployeeBackHeader
        accessibilityLabel={copy.back}
        direction={direction}
        onBack={onClose}
        textAlign={align}
        title={copy.title}
      />
      <ScrollView contentContainerStyle={[s.body, { direction }]}>
        {configInvalid ? (
          <Text
            accessibilityRole="alert"
            style={[s.configError, employeeTextStyle("human", align)]}
          >
            {copy.configError}
          </Text>
        ) : null}
        {snapshot.phase === "loading" ? (
          <View style={s.loading}>
            <Text style={[s.statusBody, employeeTextStyle("human", align)]}>
              {copy.loading}
            </Text>
          </View>
        ) : snapshot.phase === "load-error" ? (
          <>
            <Text
              accessibilityRole="alert"
              style={[s.configError, employeeTextStyle("human", align)]}
            >
              {copy.errors[snapshot.error ?? "LOAD_FAILED"]}
            </Text>
            <EmployeeButton
              label={copy.retry}
              onPress={() => void session.retry()}
            />
          </>
        ) : snapshot.phase === "ready" ? (
          <>
            {snapshot.error ? (
              <Text
                accessibilityRole="alert"
                style={[s.configError, employeeTextStyle("human", align)]}
              >
                {copy.errors[snapshot.error]}
              </Text>
            ) : null}
            <NativeGuestAccessStatusCard
              copyFeedback={copyFeedback}
              credentialFresh={credentialFresh}
              locale={locale}
              onCopy={() => {
                if (onCopy === undefined) return;
                void onCopy().then((ok) =>
                  setCopyFeedback(ok ? "copied" : "failed"),
                );
              }}
              snapshot={snapshot}
              suppressCredentialSurfaces={configInvalid}
            />
            {actions.primary ? (
              <EmployeeButton
                busy={
                  snapshot.mutation === "creating" ||
                  snapshot.mutation === "reissuing"
                }
                disabled={primaryBlocked}
                label={primaryLabel}
                onPress={handlePrimary}
                variant={
                  actions.primary.kind === "REISSUE" && credentialFresh
                    ? "secondary"
                    : "primary"
                }
              />
            ) : null}
            {actions.revoke ? (
              <EmployeeButton
                busy={snapshot.mutation === "revoking"}
                disabled={mutationBlocked}
                label={copy.revoke}
                onPress={() => setConfirm("revoke")}
                variant="danger"
              />
            ) : null}
            {online === false ? (
              <Text style={s.mutedCenter}>{copy.noNetwork}</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      {confirm === "reissue" ? (
        <NativeGuestAccessConfirmSheet
          body={copy.reissueBody}
          cancel={copy.cancel}
          confirm={copy.reissue}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            onIssue?.();
          }}
          textAlign={align}
          title={copy.reissueTitle}
          variant="primary"
        />
      ) : null}
      {confirm === "revoke" ? (
        <NativeGuestAccessConfirmSheet
          body={copy.revokeBody}
          cancel={copy.cancel}
          confirm={copy.revoke}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void session.revoke();
          }}
          textAlign={align}
          title={copy.revokeTitle}
          variant="danger"
        />
      ) : null}
    </>
  );
}
