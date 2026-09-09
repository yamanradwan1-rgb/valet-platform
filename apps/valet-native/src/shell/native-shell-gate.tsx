import type {
  EmployeeLocale,
  EmployeeShiftStartSession,
  EmployeeShiftStartSnapshot,
  NativeAuthSession,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { StyleSheet, Text, View } from "react-native";

import { getNativeAuthCopy } from "../auth/native-auth-copy";
import { NativeAuthPanel } from "../auth/native-auth-panel";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { NativeShiftStartPanel } from "../shift/native-shift-start-panel";
import {
  NativeGateButton,
  NativeGateCard,
  NativeGateLocaleToggle,
  NativeGateSpinner,
  nativeGateStyles,
} from "./native-gate-primitives";
import { NativeGateShell } from "./native-gate-shell";
import { getNativeShellCopy } from "./native-shell-copy";
import type { ProductionShellState } from "./production-shell-controller";

type GateState = Exclude<ProductionShellState, { readonly kind: "active" }>;

export interface NativeShellGateProps {
  readonly auth: NativeAuthSession | undefined;
  readonly authSnapshot: NativeAuthSnapshot;
  readonly locale: EmployeeLocale;
  readonly onRetryContext: () => void;
  readonly onSelectLocale: (locale: EmployeeLocale) => void;
  readonly onSignOut: () => void;
  readonly shiftStart: EmployeeShiftStartSession | undefined;
  readonly shiftStartSnapshot: EmployeeShiftStartSnapshot;
  readonly state: GateState;
}

export function NativeShellGate(props: NativeShellGateProps) {
  const textAlign = props.locale === "ar" ? "right" : "left";
  const direction = props.locale === "ar" ? "rtl" : "ltr";
  const copy = getNativeShellCopy(props.locale);
  const authCopy = getNativeAuthCopy(props.locale);

  return (
    <NativeGateShell>
      <View
        style={[styles.content, { direction }]}
        testID={`production-gate-${props.state.kind}`}
      >
        {props.state.kind === "auth-restoring" ? (
          <LoadingGate label={authCopy.restoring} />
        ) : props.state.kind === "context-loading" ? (
          <LoadingGate label={copy.loadingContext} />
        ) : isAuthGate(props.state) ? (
          <>
            <NativeAuthPanel
              copy={authCopy}
              gate
              session={props.auth}
              snapshot={props.authSnapshot}
              textAlign={textAlign}
              tone="dark"
            />
            <View style={styles.localeAfterAction}>
              <NativeGateLocaleToggle
                locale={props.locale}
                onSelectLocale={props.onSelectLocale}
              />
            </View>
          </>
        ) : props.state.kind === "no-active-shift" ? (
          <NoActiveShiftGate {...props} textAlign={textAlign} />
        ) : (
          <BlockingGate
            locale={props.locale}
            onRetryContext={props.onRetryContext}
            onSelectLocale={props.onSelectLocale}
            onSignOut={props.onSignOut}
            state={props.state}
            textAlign={textAlign}
          />
        )}
      </View>
    </NativeGateShell>
  );
}

function LoadingGate({ label }: { readonly label: string }) {
  return (
    <View style={nativeGateStyles.loadingStack} testID="native-gate-loading">
      <NativeGateSpinner label={label} />
      <Text style={nativeGateStyles.loadingLabel}>{label}</Text>
    </View>
  );
}

function NoActiveShiftGate({
  locale,
  onRetryContext,
  onSelectLocale,
  onSignOut,
  shiftStart,
  shiftStartSnapshot,
  textAlign,
}: NativeShellGateProps & { readonly textAlign: "left" | "right" }) {
  const copy = getNativeShellCopy(locale);
  return (
    <>
      <NativeGateCard style={styles.cardSpacing} testID="native-no-shift-card">
        <Text
          accessibilityRole="header"
          style={[nativeGateStyles.title, { textAlign }]}
        >
          {copy.noShiftTitle}
        </Text>
        <Text style={[nativeGateStyles.body, { textAlign }]}>
          {copy.noShiftBody}
        </Text>
      </NativeGateCard>
      <View
        style={nativeGateStyles.actionStack}
        testID="native-no-shift-actions"
      >
        <NativeGateLocaleToggle
          locale={locale}
          onSelectLocale={onSelectLocale}
        />
        {shiftStart ? (
          <NativeShiftStartPanel
            locale={locale}
            session={shiftStart}
            snapshot={shiftStartSnapshot}
          />
        ) : null}
        <NativeGateButton
          label={copy.retry}
          onPress={onRetryContext}
          variant="secondary"
        />
        <NativeGateButton
          label={copy.signOut}
          onPress={onSignOut}
          variant="secondary"
        />
      </View>
    </>
  );
}

function BlockingGate({
  locale,
  onRetryContext,
  onSelectLocale,
  onSignOut,
  state,
  textAlign,
}: {
  readonly locale: EmployeeLocale;
  readonly onRetryContext: () => void;
  readonly onSelectLocale: (locale: EmployeeLocale) => void;
  readonly onSignOut: () => void;
  readonly state: Exclude<
    GateState,
    | { readonly kind: "auth-error" }
    | { readonly kind: "auth-recovery" }
    | { readonly kind: "auth-restoring" }
    | { readonly kind: "context-loading" }
    | { readonly kind: "logged-out" }
    | { readonly kind: "no-active-shift" }
  >;
  readonly textAlign: "left" | "right";
}) {
  const copy = getNativeShellCopy(locale);
  const ambiguous =
    state.kind === "operational-error" &&
    state.reason === "ambiguous-active-shifts";
  const presentation = blockingPresentation(state, copy, locale);
  return (
    <>
      <NativeGateCard
        style={styles.cardSpacing}
        testID={`native-${state.kind}-card`}
        tone={ambiguous ? "neutral" : "error"}
      >
        <Text
          accessibilityRole="header"
          style={[
            nativeGateStyles.title,
            !ambiguous && nativeGateStyles.errorTitle,
            { textAlign },
          ]}
        >
          {presentation.title}
        </Text>
        <Text
          style={[
            nativeGateStyles.body,
            !ambiguous && nativeGateStyles.errorBody,
            employeeTextStyle("human", textAlign),
          ]}
        >
          {ambiguous &&
          state.kind === "operational-error" &&
          state.count !== null ? (
            <>
              <Text style={styles.identifier}>{state.count}</Text>{" "}
              {copy.activeShiftsFound} {copy.ambiguousShiftDetail}
            </>
          ) : (
            presentation.body
          )}
        </Text>
      </NativeGateCard>
      <View style={nativeGateStyles.actionStack}>
        {ambiguous ? (
          <NativeGateLocaleToggle
            locale={locale}
            onSelectLocale={onSelectLocale}
          />
        ) : null}
        <NativeGateButton label={copy.retry} onPress={onRetryContext} />
        <NativeGateButton
          label={copy.signOut}
          onPress={onSignOut}
          variant="secondary"
        />
      </View>
    </>
  );
}

function isAuthGate(state: GateState) {
  return (
    state.kind === "auth-error" ||
    state.kind === "auth-recovery" ||
    state.kind === "logged-out"
  );
}

function blockingPresentation(
  state: Exclude<
    GateState,
    {
      readonly kind:
        | "auth-error"
        | "auth-recovery"
        | "auth-restoring"
        | "context-loading"
        | "logged-out"
        | "no-active-shift";
    }
  >,
  copy: ReturnType<typeof getNativeShellCopy>,
  locale: EmployeeLocale,
) {
  if (state.kind === "access-denied")
    return { body: copy.accessDeniedBody, title: copy.accessDeniedTitle };
  if (state.kind === "no-usable-location")
    return { body: copy.noLocationBody, title: copy.noLocationTitle };
  if (state.reason === "ambiguous-active-shifts")
    return { body: copy.ambiguousShiftDetail, title: copy.multipleShiftsTitle };
  return {
    body:
      locale === "en" && state.message ? state.message : copy.contextErrorBody,
    title: copy.contextErrorTitle,
  };
}

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: 24 },
  content: { width: "100%" },
  identifier: { writingDirection: "ltr" },
  localeAfterAction: { marginTop: 16 },
});
