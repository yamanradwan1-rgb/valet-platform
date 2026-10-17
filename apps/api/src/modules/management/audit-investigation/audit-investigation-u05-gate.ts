/** Owner approval is for local IMPLEMENTATION and VALIDATION, not activation.
 * The newly migrated G2 database may exercise pagination only in a guarded
 * test run. Runtime remains the old safe 503 until R01–R09 are ALL proven.
 */
export function isU05LocalProofEnabled(): boolean {
  if (process.env.NODE_ENV !== "test" ||
      process.env.ISSUE300_U05_G2_PROOF_ENABLE !== "1") return false;
  try {
    const target = new URL(process.env.DATABASE_URL ?? "");
    return target.hostname === "127.0.0.1" && target.port === "55480" &&
      target.pathname === "/issue300_g2" && target.search === "" &&
      target.hash === "";
  } catch { return false; }
}
