import * as Clipboard from "expo-clipboard";
import { isCanonicalNativeGuestAccessUrl } from "./native-customer-app-origin";

/** Copies only a current canonical credential URL, and only on explicit use. */
export async function copyNativeGuestAccessUrl(
  credentialUrl: string | null,
): Promise<boolean> {
  if (
    credentialUrl === null ||
    !isCanonicalNativeGuestAccessUrl(credentialUrl)
  ) {
    return false;
  }
  try {
    await Clipboard.setStringAsync(credentialUrl);
    return true;
  } catch {
    return false;
  }
}
