import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import type {
  NativeAuthSession,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import type { NativeAuthCopy } from "./native-auth-copy";
import { styles } from "../foundation/foundation-styles";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { employeeColors } from "../employee-ui/employee-tokens";

interface NativeAuthPanelProps {
  readonly copy: NativeAuthCopy;
  readonly session: NativeAuthSession | undefined;
  readonly snapshot: NativeAuthSnapshot;
  readonly textAlign: "left" | "right";
  readonly compact?: boolean;
}

export function NativeAuthPanel({
  copy,
  session,
  snapshot,
  textAlign,
  compact = false,
}: NativeAuthPanelProps) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  if (snapshot.phase === "restoring") {
    return <StatusText copy={copy.restoring} textAlign={textAlign} />;
  }
  if (snapshot.phase === "fatal" || session === undefined) {
    return <StatusText copy={copy.fatal} textAlign={textAlign} />;
  }
  if (snapshot.phase === "restoration-unavailable") {
    return (
      <View style={styles.authPanel}>
        <StatusText copy={copy.transient} textAlign={textAlign} />
        <ActionButton
          disabled={busy}
          label={copy.retry}
          onPress={() => void run(() => session.refresh())}
        />
      </View>
    );
  }
  if (snapshot.phase === "authenticated") {
    if (compact) {
      return (
        <EmployeeButton
          disabled={busy}
          label={copy.logout}
          onPress={() => void run(() => session.logout())}
          size="compact"
          variant="ghost"
        />
      );
    }
    return (
      <View style={styles.authPanel}>
        <StatusText copy={copy.authenticated} textAlign={textAlign} />
        <ActionButton
          disabled={busy}
          label={copy.logout}
          onPress={() => void run(() => session.logout())}
        />
      </View>
    );
  }

  const showFailure =
    snapshot.reason === "authentication-failed" ||
    snapshot.reason === "transient-failure" ||
    snapshot.reason === "secure-storage-failure";
  return (
    <View style={styles.authPanel}>
      {showFailure ? (
        <Text style={[styles.errorText, { textAlign }]}>
          {copy.loginFailed}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={copy.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder={copy.email}
        placeholderTextColor={employeeColors.muted}
        style={[styles.input, { textAlign }]}
        value={email}
      />
      <TextInput
        accessibilityLabel={copy.password}
        autoCapitalize="none"
        autoComplete="current-password"
        onChangeText={setPassword}
        placeholder={copy.password}
        placeholderTextColor={employeeColors.muted}
        secureTextEntry
        style={[styles.input, { textAlign }]}
        value={password}
      />
      <ActionButton
        disabled={busy || email.length === 0 || password.length === 0}
        label={copy.login}
        onPress={() =>
          void run(() => session.login({ email, password })).finally(() =>
            setPassword(""),
          )
        }
      />
    </View>
  );
}

function StatusText({
  copy,
  textAlign,
}: {
  copy: string;
  textAlign: "left" | "right";
}) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.status, { textAlign }]}
    >
      {copy}
    </Text>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return <EmployeeButton label={label} disabled={disabled} onPress={onPress} />;
}
