import { ApiTransportValidationError } from "../../common/http/api-errors";

interface TaskRouteCursor {
  readonly taskId: string;
  readonly startedAt: string;
  readonly id: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeTaskRouteCursor(
  value: string | undefined,
  taskId: string,
) {
  if (value === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 512)
      throw new Error();
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (typeof parsed !== "object" || parsed === null) throw new Error();
    const row = parsed as TaskRouteCursor;
    if (
      Object.keys(row).sort().join(",") !== "id,startedAt,taskId" ||
      row.taskId !== taskId ||
      typeof row.id !== "string" ||
      !uuid.test(row.id) ||
      typeof row.startedAt !== "string" ||
      new Date(row.startedAt).toISOString() !== row.startedAt
    )
      throw new Error();
    return row;
  } catch {
    throw new ApiTransportValidationError();
  }
}

export function encodeTaskRouteCursor(value: TaskRouteCursor) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
