import { useCallback, useRef } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { startNativePushResponseCapture } from "@/notifications/native-push-response-bootstrap";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

startNativePushResponseCapture();

export default function RootLayout() {
  const hasHiddenSplash = useRef(false);
  const hideSplashWhenRootIsReady = useCallback(() => {
    if (hasHiddenSplash.current) {
      return;
    }
    hasHiddenSplash.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView
      onLayout={hideSplashWhenRootIsReady}
      style={{ flex: 1 }}
    >
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
