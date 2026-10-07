export function databaseUrlFor(
  adminDatabaseUrl: string,
  databaseName: string,
): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function runtimeDatabaseUrlFor(
  adminDatabaseUrl: string,
  databaseName: string,
  runtimeRole: string,
  runtimePassword: string,
): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  url.username = runtimeRole;
  url.password = runtimePassword;
  return url.toString();
}
