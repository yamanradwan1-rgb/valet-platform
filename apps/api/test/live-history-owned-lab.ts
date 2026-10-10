/**
 * The historical #276 load/race fixture is an explicitly opted-in Windows
 * disposable lab, not a generic CI connection. PostgreSQL in Linux CI uses
 * a different controlled cluster/port; never point these destructive child
 * database builders at that shared database or an implicit developer URL.
 */
export function isolatedLiveHistoryLabConfigured(): boolean {
  const url = process.env.TEST_DATABASE_URL;
  if (process.platform !== "win32" || !url ||
      url !== process.env.MIGRATION_DATABASE_URL) return false;
  try {
    const target = new URL(url);
    return target.protocol === "postgresql:" &&
      target.hostname === "127.0.0.1" && target.port === "55449" &&
      target.username === "valet276test" && target.pathname === "/postgres";
  } catch {
    return false;
  }
}
