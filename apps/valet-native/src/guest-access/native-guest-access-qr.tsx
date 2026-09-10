import QRCode from "qrcode";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { isCanonicalNativeGuestAccessUrl } from "./native-customer-app-origin";
import { nativeGuestAccessStyles as s } from "./native-guest-access-styles";

const QUIET_ZONE_MODULES = 4;

export interface NativeGuestAccessQrMatrix {
  readonly darkPath: string;
  readonly size: number;
}

/** Pure-JS encoding boundary; no canvas/browser API and no credential storage. */
export function createNativeGuestAccessQrMatrix(
  credentialUrl: string | null,
): NativeGuestAccessQrMatrix | null {
  if (
    credentialUrl === null ||
    !isCanonicalNativeGuestAccessUrl(credentialUrl)
  ) {
    return null;
  }
  try {
    const qr = QRCode.create(credentialUrl, { errorCorrectionLevel: "M" });
    const { data, size } = qr.modules;
    if (size < 21 || data.length !== size * size) return null;
    const commands: string[] = [];
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        if (data[row * size + column] !== 0) {
          commands.push(
            `M${column + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h1v1h-1z`,
          );
        }
      }
    }
    return { darkPath: commands.join(""), size };
  } catch {
    return null;
  }
}

export function NativeGuestAccessQr({
  alt,
  credentialUrl,
}: {
  readonly alt: string;
  readonly credentialUrl: string | null;
}) {
  const matrix = createNativeGuestAccessQrMatrix(credentialUrl);
  if (matrix === null) return null;
  const totalSize = matrix.size + QUIET_ZONE_MODULES * 2;
  return (
    <View
      accessibilityLabel={alt}
      accessibilityRole="image"
      style={s.qr}
      testID="guest-access-qr"
    >
      <Svg
        accessible={false}
        height="100%"
        viewBox={`0 0 ${totalSize} ${totalSize}`}
        width="100%"
      >
        <Rect fill="#FFFFFF" height={totalSize} width={totalSize} />
        <Path d={matrix.darkPath} fill="#07111F" />
      </Svg>
    </View>
  );
}
