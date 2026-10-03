import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeAuthSnapshot } from "@valet/employee-client";

import { getNativePocPresentation } from "./native-poc-presentation";
import {
  checkingNativePocProbeSnapshot,
  initialNativePocProbeSnapshot,
  runNativePocChecks,
} from "./native-poc-probes";
import { stylesTheme } from "../foundation/foundation-styles";

interface NativePocPanelProps {
  readonly apiOrigin: string | undefined;
  readonly auth: NativeAuthSnapshot;
}

export function NativePocPanel({ apiOrigin, auth }: NativePocPanelProps) {
  const styles = useEmployeeStyles(stylesTheme);

  const mounted = useRef(true);
  const [probes, setProbes] = useState(initialNativePocProbeSnapshot);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const presentation = getNativePocPresentation(
    __DEV__,
    apiOrigin,
    probes,
    auth,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (presentation === null) return null;

  if (!expanded) {
    return (
      <Pressable
        accessibilityLabel={presentation.title}
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        onPress={() => setExpanded(true)}
        style={styles.devDiagnosticsButton}
        testID="native-poc-diagnostics-toggle"
      >
        <Text style={styles.devDiagnosticsButtonLabel}>
          {presentation.title}
        </Text>
      </Pressable>
    );
  }

  const runChecks = async () => {
    if (busy) return;
    setBusy(true);
    setProbes(checkingNativePocProbeSnapshot);
    const result = await runNativePocChecks(apiOrigin);
    if (mounted.current) {
      setProbes(result);
      setBusy(false);
    }
  };

  return (
    <View
      accessibilityState={{ expanded: true }}
      style={styles.devDiagnostics}
      testID="native-poc-diagnostics"
    >
      <Text style={styles.devDiagnosticsTitle}>{presentation.title}</Text>
      <Diagnostic label="API" value={presentation.apiOrigin} />
      <Diagnostic
        label="API reachability"
        value={presentation.apiReachability}
      />
      <Diagnostic label="SecureStore" value={presentation.secureStore} />
      <Diagnostic
        label="Installation storage"
        value={presentation.installationStorage}
      />
      <Diagnostic label="Auth phase" value={presentation.authPhase} />
      <Diagnostic label="Auth reason" value={presentation.authReason} />
      <Diagnostic label="Auth generation" value={presentation.authGeneration} />
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void runChecks()}
        style={[styles.devDiagnosticsButton, busy && styles.disabledButton]}
      >
        <Text style={styles.devDiagnosticsButtonLabel}>Run POC checks</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Hide POC diagnostics"
        accessibilityRole="button"
        onPress={() => setExpanded(false)}
        style={styles.devDiagnosticsButton}
      >
        <Text style={styles.devDiagnosticsButtonLabel}>Hide</Text>
      </Pressable>
    </View>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  const styles = useEmployeeStyles(stylesTheme);

  return (
    <Text style={styles.devDiagnosticsFact}>
      {label}: {value}
    </Text>
  );
}
