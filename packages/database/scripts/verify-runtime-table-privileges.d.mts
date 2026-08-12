import type { PoolClient } from "pg";

export declare function verifyRuntimeTablePrivileges(
  client: Pick<PoolClient, "query">,
  runtimeRole: string,
): Promise<void>;
