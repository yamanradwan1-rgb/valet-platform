import {
  useEmployeeStyles,
  useEmployeePalette,
} from "../appearance/employee-appearance-context";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import type {
  NativeAuthSession,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import type { NativeAuthCopy } from "./native-auth-copy";
import { EmployeeButton } from "../employee-ui/employee-controls";

import { stylesTheme } from "../foundation/foundation-styles";

export function NativeAuthFoundationPanel({
  busy,
  copy,
  run,
  session,
  snapshot,
  textAlign,
  tone = "light",
}: {
  readonly busy: boolean;
  readonly copy: NativeAuthCopy;
  readonly run: (action: () => Promise<unknown>) => Promise<void>;
  readonly session: NativeAuthSession | undefined;
  readonly snapshot: NativeAuthSnapshot;
  readonly textAlign: "left" | "right";
  readonly tone?: "dark" | "light";
}) {
  const p = useEmployeePalette();
  const styles = useEmployeeStyles(stylesTheme);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  if (snapshot.phase === "restoring")
    return (
      <StatusText copy={copy.restoring} textAlign={textAlign} tone={tone} />
    );
  if (snapshot.phase === "fatal" || session === undefined)
    return <StatusText copy={copy.fatal} textAlign={textAlign} tone={tone} />;
  if (snapshot.phase === "restoration-unavailable") {
    return (
      <View style={styles.authPanel}>
        <StatusText copy={copy.transient} textAlign={textAlign} tone={tone} />
        <EmployeeButton
          disabled={busy}
          label={copy.retry}
          onPress={() => void run(() => session.refresh())}
        />
      </View>
    );
  }
  if (snapshot.phase === "authenticated") {
    return (
      <View style={styles.authPanel}>
        <StatusText
          copy={copy.authenticated}
          textAlign={textAlign}
          tone={tone}
        />
        <EmployeeButton
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
        <Text
          style={[
            styles.errorText,
            tone === "dark" && styles.darkErrorText,
            { textAlign },
          ]}
        >
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
        placeholderTextColor={p.textMuted}
        style={[
          styles.input,
          tone === "dark" && styles.darkInput,
          { textAlign },
        ]}
        value={email}
      />
      <TextInput
        accessibilityLabel={copy.password}
        autoCapitalize="none"
        autoComplete="current-password"
        onChangeText={setPassword}
        placeholder={copy.password}
        placeholderTextColor={p.textMuted}
        secureTextEntry
        style={[
          styles.input,
          tone === "dark" && styles.darkInput,
          { textAlign },
        ]}
        value={password}
      />
      <EmployeeButton
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
  tone,
}: {
  readonly copy: string;
  readonly textAlign: "left" | "right";
  readonly tone: "dark" | "light";
}) {
  const styles = useEmployeeStyles(stylesTheme);

  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        styles.status,
        tone === "dark" && styles.darkStatus,
        { textAlign },
      ]}
    >
      {copy}
    </Text>
  );
}
