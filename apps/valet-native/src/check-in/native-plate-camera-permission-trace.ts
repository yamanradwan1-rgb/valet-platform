import type { NativeCameraPermissionPort } from "../scanner/native-qr-controller";
import type {
  NativePlateCameraTrace,
  PlateCameraTraceDetails,
} from "./native-plate-camera-trace";

/** Synchronous observation after the original await; adds no promise hop. */
export function recordPlateCameraPermission(
  trace: NativePlateCameraTrace,
  owner: PlateCameraTraceDetails,
  permission: Awaited<ReturnType<NativeCameraPermissionPort["get"]>>,
): void {
  trace.record("permission-result", {
    ...owner,
    granted: permission.granted,
    canAskAgain: permission.canAskAgain,
    current: owner.generation === trace.owner().generation,
  });
}
