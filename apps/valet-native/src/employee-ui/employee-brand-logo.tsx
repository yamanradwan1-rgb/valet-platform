import { Image, type ImageStyle, type StyleProp } from "react-native";

import darkLogo from "../../assets/brand/VAYLET_Logo_Dark_Background.png";
import lightLogo from "../../assets/brand/VAYLET_Logo_Light_Background.png";

const logoMetrics = {
  dark: { aspectRatio: 186 / 60, source: darkLogo },
  light: { aspectRatio: 169 / 60, source: lightLogo },
} as const;

/**
 * One native renderer for the official VAYLET wordmark. Disabling Android's
 * image fade and sizing from the source aspect ratio avoids the transient
 * soft edge / stretched treatment previously seen between gate and header.
 */
export function EmployeeBrandLogo({
  height,
  surface,
  style,
}: {
  readonly height: number;
  readonly surface: keyof typeof logoMetrics;
  readonly style?: StyleProp<ImageStyle>;
}) {
  const asset = logoMetrics[surface];
  return (
    <Image
      accessibilityLabel="VAYLET"
      fadeDuration={0}
      resizeMethod="resize"
      resizeMode="contain"
      source={asset.source}
      style={[{ aspectRatio: asset.aspectRatio, height }, style]}
    />
  );
}
