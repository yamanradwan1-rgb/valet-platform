import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import logo from "../../assets/brand/VAYLET_Logo_Dark_Background.png";
import { employeeColors as c } from "../employee-ui/employee-tokens";

export function NativeGateShell({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <SafeAreaView style={nativeGateShellStyles.safeArea}>
      <StatusBar style="light" />
      <GateRadialBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={nativeGateShellStyles.flex}
      >
        <ScrollView
          contentContainerStyle={nativeGateShellStyles.screen}
          keyboardShouldPersistTaps="handled"
        >
          <Image
            accessibilityLabel="VAYLET"
            source={logo}
            style={nativeGateShellStyles.logo}
          />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function GateRadialBackground() {
  return (
    <Svg
      accessible={false}
      height="100%"
      pointerEvents="none"
      style={nativeGateShellStyles.background}
      testID="native-gate-radial-background"
      width="100%"
    >
      <Defs>
        <RadialGradient
          cx="55%"
          cy="0%"
          fx="55%"
          fy="0%"
          id="employeeGateGradient"
          rx="65%"
          ry="65%"
        >
          <Stop offset="0%" stopColor="#0B2D6E" />
          <Stop offset="100%" stopColor={c.navy} />
        </RadialGradient>
      </Defs>
      <Rect fill="url(#employeeGateGradient)" height="100%" width="100%" />
    </Svg>
  );
}

export const nativeGateShellStyles = StyleSheet.create({
  background: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  flex: { flex: 1 },
  logo: {
    alignSelf: "center",
    aspectRatio: 186 / 60,
    height: 36,
    marginBottom: 48,
    resizeMode: "contain",
  },
  safeArea: { backgroundColor: c.navy, flex: 1 },
  screen: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
});
