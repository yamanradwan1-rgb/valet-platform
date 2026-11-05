declare module "*ownership-state.mjs" {
  export function assertClusterLeaseOwner(args: {
    databaseUrl: string;
    runId: string;
  }): { runId: string };
}

declare module "*ocr-principal-privileges.mjs" {
  export function provisionOcrPrincipal(
    client: import("pg").Client,
    formatted: (
      client: import("pg").Client, format: string, values: string[],
    ) => Promise<void>,
    kind: "operator" | "maintenance",
    role: string,
    database: string,
  ): Promise<void>;
  export function verifyOcrPrincipal(
    client: import("pg").Client, kind: "operator" | "maintenance", role: string,
  ): Promise<void>;
}

declare module "*ocr-runtime-privileges.mjs" {
  export function verifyOcrRuntimePrivileges(
    client: import("pg").Client, role: string,
  ): Promise<void>;
}
