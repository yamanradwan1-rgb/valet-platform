export async function logoutWithEmployeePushCleanup(
  cleanup: () => Promise<void>,
  logout: () => Promise<void>,
  cleanupTimeoutMs = 2_000,
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      cleanup(),
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, cleanupTimeoutMs);
      }),
    ]);
  } catch {
    // Notification cleanup never blocks canonical server logout.
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
  await logout();
}
