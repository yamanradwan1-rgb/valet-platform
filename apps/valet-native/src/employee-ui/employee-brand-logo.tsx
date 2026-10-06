import { Image, type ImageStyle, type StyleProp } from "react-native";

import darkLogo from "../../assets/brand/VAYLET_Logo_Dark_Background.png";
import lightLogo from "../../assets/brand/VAYLET_Logo_Light_Background.png";

const logoMetrics = {
  dark: { aspectRatio: 186 / 60, source: darkLogo },
  light: { aspectRatio: 169 / 60, source: lightLogo },
} as const;

/**
 * One native renderer for the official VAYLET wordmark. Standalone surfaces
 * size from the source ratio; `fill` lets a parent layout box own geometry.
 * Contain sizing preserves the artwork ratio in either case.
 */
export function EmployeeBrandLogo({
  fill,
  height,
  surface,
  style,
}: {
  readonly fill?: boolean;
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
      style={[
        fill
          ? { height, width: "100%" }
          : { aspectRatio: asset.aspectRatio, height },
        style,
      ]}
    />
  );
}
