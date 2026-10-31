/** A sensitive mutation reports success only through its guarded onSuccess. */
export async function confirmedStudioSettingsMutation(
  run: (
    operation: () => Promise<unknown>,
    onSuccess: () => void,
  ) => Promise<void>,
  operation: () => Promise<unknown>,
  onReload: () => void,
): Promise<boolean> {
  let confirmed = false;
  await run(operation, () => {
    confirmed = true;
    onReload();
  });
  return confirmed;
}
