/** Only a fully asserted, cleanly torn down run can claim complete evidence. */
export function issue414HttpEvidenceComplete(
  allChecksPassed: boolean,
  rows: readonly { readonly complete?: unknown }[],
): boolean {
  return (
    allChecksPassed &&
    rows.length === 3 &&
    rows.every((row) => row.complete === true)
  );
}
