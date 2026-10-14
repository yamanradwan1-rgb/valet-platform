export interface PhotoSqlClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: object[] }>;
}

export type PhotoFormattedStatement = (
  client: PhotoSqlClient,
  format: string,
  values: string[],
) => Promise<void>;

export interface PhotoFunctionRow {
  signature: string;
  oid: string;
  security_definer: boolean;
  search_path_safe: boolean;
  owner: string;
  public_denied: boolean;
  grant_option_denied: boolean;
}

export const photoReadTables: string[];
export const photoPrivateTables: string[];
export const photoRuntimeFunctions: string[];
export const photoMaintenanceFunctions: string[];
export function listPhotoFunctions(client: PhotoSqlClient): Promise<PhotoFunctionRow[]>;
export function photoFunctionIds(
  client: PhotoSqlClient,
  signatures: string[],
): Promise<Set<string>>;
