import { useCallback, useEffect, useRef } from "react";
import { Appearance } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { startNativePushResponseCapture } from "@/notifications/native-push-response-bootstrap";
import {
  EmployeeAppearanceProvider,
  useEmployeeAppearance,
} from "@/appearance/employee-appearance-context";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

startNativePushResponseCapture();

export default function RootLayout() {
  return (
    <EmployeeAppearanceProvider>
      <AppearanceRoot />
    </EmployeeAppearanceProvider>
  );
}

function AppearanceRoot() {
  const { palette, ready } = useEmployeeAppearance();
  const hasHiddenSplash = useRef(false);
  const hasLaidOut = useRef(false);
  const hideSplashWhenRootIsReady = useCallback(() => {
    if (!ready || !hasLaidOut.current || hasHiddenSplash.current) {
      return;
    }
    hasHiddenSplash.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  useEffect(() => {
    if (ready) Appearance.setColorScheme(palette.mode);
    hideSplashWhenRootIsReady();
  }, [hideSplashWhenRootIsReady, palette.mode, ready]);

  return (
    <GestureHandlerRootView
      onLayout={() => {
        hasLaidOut.current = true;
        hideSplashWhenRootIsReady();
      }}
      pointerEvents={ready ? "auto" : "none"}
      style={{
        flex: 1,
        backgroundColor: palette.appBackground,
        opacity: ready ? 1 : 0,
      }}
    >
      <SafeAreaProvider>
        <StatusBar style={palette.mode === "dark" ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
