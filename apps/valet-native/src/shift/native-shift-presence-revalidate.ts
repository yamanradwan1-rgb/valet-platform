import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";

/** Called only after fresh authentication/context; legacy transports never replay. */
export async function revalidateNativeShiftPresence(
  runtime: NativeEmployeeRuntime,
): Promise<void> {
  if (
    runtime.shiftStart.presence?.snapshot().phase === "uncertain" &&
    runtime.shiftStart.current().phase === "uncertain"
  )
    await runtime.shiftStart.retry();
  if (
    runtime.shiftEnd.presence?.snapshot().phase === "uncertain" &&
    runtime.shiftEnd.current().phase === "uncertain"
  )
    await runtime.shiftEnd.retry();
}
