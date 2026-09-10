import { View } from "react-native";
import { nativeGuestAccessStyles as s } from "./native-guest-access-styles";

// Presentation-only pattern. It encodes no URL and is unreachable in the
// production flow while Native has no approved QR encoder/config contract.
const fixture = [
  1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0,
  1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0,
  0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0,
  0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1,
  1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0,
  1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0,
  1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1,
  1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0,
  0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1,
] as const;

export function NativeGuestAccessQrFixture({ alt }: { readonly alt: string }) {
  return (
    <View
      accessibilityLabel={alt}
      accessibilityRole="image"
      style={s.qr}
      testID="guest-access-safe-qr-fixture"
    >
      <View style={s.qrGrid}>
        {fixture.map((cell, index) => (
          <View key={index} style={cell ? s.qrOn : s.qrOff} />
        ))}
      </View>
    </View>
  );
}
