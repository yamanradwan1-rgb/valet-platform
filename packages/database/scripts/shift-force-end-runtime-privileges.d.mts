import type { PoolClient } from "pg";

export declare const runtimeShiftForceEndFunction: string;
export declare const privateShiftForceEndFunctions: readonly string[];
export declare function provisionShiftForceEndPrivileges(
  client: Pick<PoolClient, "query">,
  executeFormatted: (
    client: Pick<PoolClient, "query">,
    template: string,
    values: readonly string[],
  ) => Promise<unknown>,
  runtimeRole: string,
): Promise<void>;
export declare function verifyShiftForceEndPrivileges(
  client: Pick<PoolClient, "query">,
  runtimeRole: string,
): Promise<void>;
