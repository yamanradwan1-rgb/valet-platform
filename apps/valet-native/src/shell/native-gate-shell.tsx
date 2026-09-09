import { StatusBar } from "expo-status-bar";
import { useState, type ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
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
  const [size, setSize] = useState({ height: 0, width: 0 });
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setSize((current) =>
      current.height === layout.height && current.width === layout.width
        ? current
        : { height: layout.height, width: layout.width },
    );
  };

  return (
    <View
      accessible={false}
      onLayout={onLayout}
      pointerEvents="none"
      style={nativeGateShellStyles.background}
      testID="native-gate-radial-background"
    >
      {size.width > 0 && size.height > 0 ? (
        <GateGradientSvg height={size.height} width={size.width} />
      ) : null}
    </View>
  );
}

export function GateGradientSvg({
  height,
  width,
}: {
  readonly height: number;
  readonly width: number;
}) {
  const ellipse = employeeGateFarthestCornerEllipse(width, height);
  return (
    <Svg accessible={false} height={height} pointerEvents="none" width={width}>
      <Defs>
        <RadialGradient
          cx={ellipse.centerX}
          cy={ellipse.centerY}
          fx={ellipse.centerX}
          fy={ellipse.centerY}
          gradientUnits="userSpaceOnUse"
          id="employeeGateGradient"
          rx={ellipse.radiusX}
          ry={ellipse.radiusY}
        >
          <Stop offset="0%" stopColor="#0B2D6E" />
          <Stop offset="65%" stopColor={c.navy} />
          <Stop offset="100%" stopColor={c.navy} />
        </RadialGradient>
      </Defs>
      <Rect fill="url(#employeeGateGradient)" height="100%" width="100%" />
    </Svg>
  );
}

/** CSS `ellipse farthest-corner at 55% 0%` ending-shape geometry. */
export function employeeGateFarthestCornerEllipse(
  width: number,
  height: number,
) {
  const centerX = width * 0.55;
  const centerY = 0;
  const farthestSideX = Math.max(centerX, width - centerX);
  const farthestSideY = Math.max(centerY, height - centerY);
  const scale = Math.max(
    ...[0, width].flatMap((x) =>
      [0, height].map((y) =>
        Math.hypot(
          (x - centerX) / farthestSideX,
          (y - centerY) / farthestSideY,
        ),
      ),
    ),
  );
  return {
    centerX,
    centerY,
    radiusX: farthestSideX * scale,
    radiusY: farthestSideY * scale,
  };
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
