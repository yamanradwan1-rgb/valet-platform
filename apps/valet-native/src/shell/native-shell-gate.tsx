import { StatusBar } from "expo-status-bar";
import type {
  EmployeeLocale,
  NativeAuthSession,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import logo from "../../assets/brand/VAYLET_Logo_Light_Background.png";
import { getNativeAuthCopy } from "../auth/native-auth-copy";
import { NativeAuthPanel } from "../auth/native-auth-panel";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
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
  readonly state: GateState;
}

export function NativeShellGate({
  auth,
  authSnapshot,
  locale,
  onRetryContext,
  onSelectLocale,
  onSignOut,
  state,
}: NativeShellGateProps) {
  const copy = getNativeShellCopy(locale);
  const textAlign = locale === "ar" ? "right" : "left";
  const direction = locale === "ar" ? "rtl" : "ltr";
  const authState = [
    "auth-error",
    "auth-recovery",
    "auth-restoring",
    "logged-out",
  ].includes(state.kind);
  const presentation = gatePresentation(state, copy);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.screen, { direction }]}
          keyboardShouldPersistTaps="handled"
        >
          <View accessible={false} style={styles.glow} />
          <View style={styles.logoSurface}>
            <Image
              accessibilityLabel="VAYLET"
              source={logo}
              style={styles.logo}
            />
          </View>
          <View style={styles.card} testID={`production-gate-${state.kind}`}>
            <Text
              accessibilityRole="header"
              style={[styles.title, employeeTextStyle("human", textAlign)]}
            >
              {presentation.title}
            </Text>
            {presentation.body ? (
              <Text
                style={[styles.body, employeeTextStyle("human", textAlign)]}
              >
                {presentation.body}
              </Text>
            ) : null}
            {state.kind === "context-loading" ? (
              <ActivityIndicator
                accessibilityLabel={copy.loadingContext}
                accessibilityRole="progressbar"
                color={c.blue}
                size="large"
              />
            ) : null}
            {authState ? (
              <NativeAuthPanel
                copy={getNativeAuthCopy(locale)}
                session={auth}
                snapshot={authSnapshot}
                textAlign={textAlign}
                tone="dark"
              />
            ) : null}
          </View>
          {!authState && state.kind !== "context-loading" ? (
            <View style={styles.actions}>
              <EmployeeButton label={copy.retry} onPress={onRetryContext} />
              <EmployeeButton
                label={copy.signOut}
                onPress={onSignOut}
                variant="ghost"
              />
            </View>
          ) : null}
          <EmployeeButton
            label={locale === "en" ? copy.arabic : copy.english}
            onPress={() => onSelectLocale(locale === "en" ? "ar" : "en")}
            variant="ghost"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function gatePresentation(
  state: GateState,
  copy: ReturnType<typeof getNativeShellCopy>,
): { readonly body: string | null; readonly title: string } {
  switch (state.kind) {
    case "access-denied":
      return { body: copy.accessDeniedBody, title: copy.accessDeniedTitle };
    case "no-usable-location":
      return { body: copy.noLocationBody, title: copy.noLocationTitle };
    case "no-active-shift":
      return { body: copy.noShiftBody, title: copy.noShiftTitle };
    case "operational-error":
      return {
        body:
          state.reason === "ambiguous-active-shifts"
            ? copy.multipleShiftsBody
            : copy.contextErrorBody,
        title: copy.contextErrorTitle,
      };
    case "context-loading":
      return { body: null, title: copy.loadingContext };
    case "auth-recovery":
      return { body: null, title: copy.authRecoveryTitle };
    case "auth-error":
      return { body: null, title: copy.authErrorTitle };
    case "auth-restoring":
      return { body: null, title: copy.staffSignIn };
    case "logged-out":
      return { body: null, title: copy.staffSignIn };
  }
}

const styles = StyleSheet.create({
  actions: { gap: space.sm },
  body: { ...type.body, color: c.muted },
  card: {
    backgroundColor: "#FFFFFF0F",
    borderColor: "#FFFFFF1A",
    borderRadius: 24,
    borderWidth: 1,
    gap: space.lg,
    padding: space.hero,
    width: "100%",
  },
  flex: { flex: 1 },
  glow: {
    backgroundColor: "#0B2D6E",
    borderRadius: 220,
    height: 360,
    opacity: 0.8,
    position: "absolute",
    right: -100,
    top: -190,
    width: 440,
  },
  logo: { height: 36, resizeMode: "contain", width: 154 },
  logoSurface: {
    alignSelf: "center",
    backgroundColor: c.white,
    borderRadius: employeeRadius.form,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  safeArea: { backgroundColor: c.navy, flex: 1 },
  screen: {
    flexGrow: 1,
    gap: space.hero,
    justifyContent: "center",
    paddingBottom: 40,
    paddingHorizontal: space.hero,
    paddingTop: space.hero,
  },
  title: { ...type.header, color: c.white, fontSize: 20, fontWeight: "700" },
});
