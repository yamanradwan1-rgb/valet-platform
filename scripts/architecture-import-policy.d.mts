export function importViolation(
  sourcePath: string,
  specifier: string,
  workspacePackageRoots: ReadonlyMap<string, string>,
): string | undefined;
export function resolveImportTarget(
  sourcePath: string,
  specifier: string,
  workspacePackageRoots: ReadonlyMap<string, string>,
): string | undefined;
