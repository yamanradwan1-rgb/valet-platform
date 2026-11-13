import { useLocalSearchParams, useRouter } from "expo-router";
import { NativeWhatsAppPrototypeScreen } from "../src/prototypes/whatsapp/native-whatsapp-prototype-screen";
import { parseWhatsAppDemoState } from "../src/prototypes/whatsapp/native-whatsapp-prototype-state";

/** Development fixture only; no entry in production navigation. */
export default function WhatsAppPrototypeRoute() {
  const params = useLocalSearchParams<{
    baseline?: string;
    locale?: string;
    state?: string;
    theme?: string;
  }>();
  const router = useRouter();
  if (!__DEV__) return null;
  return (
    <NativeWhatsAppPrototypeScreen
      baseline={params.baseline === "1"}
      initialState={parseWhatsAppDemoState(params.state)}
      locale={params.locale === "ar" ? "ar" : "en"}
      onBack={() => router.back()}
      theme={params.theme === "dark" ? "dark" : "light"}
    />
  );
}
