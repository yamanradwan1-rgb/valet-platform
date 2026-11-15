import type { PostgresPool } from "./postgres";
import { createRuntimePostgresPool } from "./postgres";

export const MFA_CEREMONY_POSTGRES_POOL = Symbol("MFA_CEREMONY_POSTGRES_POOL");

let protectedPool: PostgresPool | undefined;

export function mfaProtectedWriterEnabled(): boolean {
  const value = process.env.MFA_PROTECTED_WRITER_ENABLED;
  if (value !== undefined && value !== "true" && value !== "false") {
    throw new Error("MFA_PROTECTED_WRITER_ENABLED must be true or false.");
  }
  if (process.env.NODE_ENV === "production" && value !== "true") {
    throw new Error("Production requires the protected MFA writer.");
  }
  return value === "true";
}

export function getMfaProtectedPool(): PostgresPool {
  if (!mfaProtectedWriterEnabled()) {
    throw new Error("Protected MFA writer is not enabled.");
  }
  if (protectedPool) return protectedPool;
  const source = process.env.DATABASE_URL;
  const writer = process.env.MFA_WRITER_DATABASE_URL;
  if (!source || !writer) {
    throw new Error("Protected MFA requires ordinary and writer DB URLs.");
  }
  const runtimeUrl = new URL(source);
  const writerUrl = new URL(writer);
  if (
    runtimeUrl.username === writerUrl.username ||
    runtimeUrl.password === writerUrl.password ||
    runtimeUrl.host !== writerUrl.host ||
    runtimeUrl.pathname !== writerUrl.pathname ||
    !writerUrl.password
  ) {
    throw new Error("Protected MFA writer must be a separate same-DB principal.");
  }
  protectedPool = createRuntimePostgresPool(writer);
  return protectedPool;
}

export async function closeMfaProtectedPool(): Promise<void> {
  const current = protectedPool;
  protectedPool = undefined;
  if (current) await current.end();
}
