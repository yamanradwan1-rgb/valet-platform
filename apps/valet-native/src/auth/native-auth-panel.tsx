import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type {
  NativeAuthSession,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import type { NativeAuthCopy } from "./native-auth-copy";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { employeeColors as c } from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeFontWeights,
  employeeTextStyle,
} from "../employee-ui/employee-typography";
import {
  NativeGateButton,
  NativeGateCard,
  nativeGateStyles,
} from "../shell/native-gate-primitives";
import { NativeAuthFoundationPanel } from "./native-auth-foundation-panel";

interface NativeAuthPanelProps {
  readonly copy: NativeAuthCopy;
  readonly session: NativeAuthSession | undefined;
  readonly snapshot: NativeAuthSnapshot;
  readonly textAlign: "left" | "right";
  readonly compact?: boolean;
  readonly gate?: boolean;
  readonly tone?: "dark" | "light";
}

export function NativeAuthPanel(props: NativeAuthPanelProps) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  if (props.compact && props.snapshot.phase === "authenticated") {
    return (
      <EmployeeButton
        disabled={busy}
        label={props.copy.logout}
        onPress={() => void run(() => props.session!.logout())}
        size="compact"
        variant="ghost"
      />
    );
  }
  if (props.gate) return <GateAuthPanel {...props} busy={busy} run={run} />;
  return <NativeAuthFoundationPanel {...props} busy={busy} run={run} />;
}

function GateAuthPanel({
  busy,
  copy,
  run,
  session,
  snapshot,
  textAlign,
}: NativeAuthPanelProps & {
  readonly busy: boolean;
  readonly run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  if (snapshot.phase === "restoration-unavailable") {
    return (
      <View style={gateStyles.stack}>
        <NativeGateCard
          style={gateStyles.cardSpacing}
          testID="native-auth-restore-card"
        >
          <Text
            accessibilityRole="header"
            style={[nativeGateStyles.title, { textAlign }]}
          >
            {copy.connectionIssue}
          </Text>
          <Text style={[nativeGateStyles.body, { textAlign }]}>
            {copy.transient}
          </Text>
        </NativeGateCard>
        <NativeGateButton
          busy={busy}
          disabled={busy}
          label={busy ? copy.retrying : copy.retry}
          onPress={() => void run(() => session!.refresh())}
          size="login"
        />
      </View>
    );
  }
  if (snapshot.phase === "fatal" || session === undefined) {
    return (
      <NativeGateCard testID="native-auth-fatal-card">
        <Text
          accessibilityRole="header"
          style={[nativeGateStyles.title, { textAlign }]}
        >
          {copy.fatalTitle}
        </Text>
        <Text style={[nativeGateStyles.body, { textAlign }]}>{copy.fatal}</Text>
      </NativeGateCard>
    );
  }
  const showFailure =
    snapshot.reason === "authentication-failed" ||
    snapshot.reason === "transient-failure" ||
    snapshot.reason === "secure-storage-failure";
  return (
    <View style={gateStyles.stack} testID="native-auth-login">
      <NativeGateCard
        style={gateStyles.cardSpacing}
        testID="native-auth-login-card"
      >
        <Text
          accessibilityRole="header"
          style={[nativeGateStyles.title, gateStyles.loginTitle, { textAlign }]}
        >
          {copy.staffSignIn}
        </Text>
        <GateFieldLabel label={copy.email} textAlign={textAlign} />
        <TextInput
          accessibilityLabel={copy.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onBlur={() => setFocused(null)}
          onChangeText={setEmail}
          onFocus={() => setFocused("email")}
          style={[
            gateStyles.input,
            gateStyles.emailInput,
            focused === "email" && gateStyles.inputFocused,
            employeeTextStyle("identifier", textAlign),
          ]}
          value={email}
        />
        <GateFieldLabel label={copy.password} textAlign={textAlign} />
        <TextInput
          accessibilityLabel={copy.password}
          autoCapitalize="none"
          autoComplete="current-password"
          onBlur={() => setFocused(null)}
          onChangeText={setPassword}
          onFocus={() => setFocused("password")}
          secureTextEntry
          style={[
            gateStyles.input,
            focused === "password" && gateStyles.inputFocused,
            employeeTextStyle("human", textAlign),
          ]}
          value={password}
        />
      </NativeGateCard>
      {showFailure ? (
        <View style={gateStyles.loginError} testID="native-auth-login-error">
          <Text style={[gateStyles.loginErrorText, { textAlign }]}>
            {copy.loginFailed}
          </Text>
        </View>
      ) : null}
      <NativeGateButton
        busy={busy}
        disabled={busy || email.length === 0 || password.length === 0}
        label={busy ? copy.signingIn : copy.login}
        onPress={() =>
          void run(() => session.login({ email, password })).finally(() =>
            setPassword(""),
          )
        }
        size="login"
      />
    </View>
  );
}

function GateFieldLabel({
  label,
  textAlign,
}: {
  readonly label: string;
  readonly textAlign: "left" | "right";
}) {
  return <Text style={[gateStyles.fieldLabel, { textAlign }]}>{label}</Text>;
}

export const nativeAuthGateStyles = StyleSheet.create({
  emailInput: { marginBottom: 16 },
  fieldLabel: {
    color: c.muted,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: employeeFontWeights.bold,
    letterSpacing: 0.6,
    lineHeight: 16,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#FFFFFF14",
    borderColor: "#FFFFFF26",
    borderRadius: 12,
    borderWidth: 1,
    color: c.white,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    height: 48,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  inputFocused: { borderColor: c.blue },
  loginError: {
    backgroundColor: "#EF44441A",
    borderColor: "#F871714D",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 12,
  },
  loginErrorText: {
    color: "#FCA5A5",
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    lineHeight: 16,
  },
  loginTitle: { marginBottom: 20 },
  cardSpacing: { marginBottom: 24 },
  stack: { width: "100%" },
});

const gateStyles = nativeAuthGateStyles;
