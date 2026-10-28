import { AsyncLocalStorage } from "node:async_hooks";

// Source-owned categories only. Never retain a URL, header, principal or selector.
export const databaseOperations = [
  "OTHER",
  "AUTH",
  "CONTEXT",
  "TASK_QUEUE",
  "DIRECTORY",
  "CHECK_IN",
  "PHOTO",
  "DASHBOARD",
  "GUEST",
  "STAFF",
  "HEALTH",
] as const;
const operations = new AsyncLocalStorage<number>();

export function databaseOperationIndex(): number {
  return operations.getStore() ?? 0;
}

export function withHttpDatabaseOperation<T>(
  method: unknown,
  url: unknown,
  action: () => T,
): T {
  const path = typeof url === "string" ? (url.split("?", 1)[0] ?? "") : "";
  let index = 0;
  if (path === "/health/live" || path === "/health/ready") index = 10;
  else if (/^\/v1\/staff\/auth(?:\/|$)/.test(path)) index = 1;
  else if (method === "GET" && path === "/v1/staff/operational-context")
    index = 2;
  else if (method === "GET" && path === "/v1/staff/tasks/queue") index = 3;
  else if (method === "GET" && path === "/v1/staff/valet-sessions/directory")
    index = 4;
  else if (
    /^\/v1\/staff\/check-in\/sessions\/[^/]+\/condition-photo(?:-|\/|$)/.test(
      path,
    )
  )
    index = 6;
  else if (/^\/v1\/staff\/check-in(?:\/|$)/.test(path)) index = 5;
  else if (/^\/v1\/staff\/dashboard(?:\/|$)/.test(path)) index = 7;
  else if (/^\/v1\/guest(?:\/|$)/.test(path)) index = 8;
  else if (/^\/v1\/staff(?:\/|$)/.test(path)) index = 9;
  return operations.run(index, action);
}
