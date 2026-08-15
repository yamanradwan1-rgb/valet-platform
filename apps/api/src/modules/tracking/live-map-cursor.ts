import { ApiTransportValidationError } from "../../common/http/api-errors";

export interface LiveMapCursor {
  readonly id: string;
  readonly startedAt: Date;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeLiveMapCursor(value?: string): LiveMapCursor | null {
  if (value === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (typeof decoded !== "object" || decoded === null) throw new Error();
    const keys = Object.keys(decoded);
    const candidate = decoded as { id?: unknown; startedAt?: unknown };
    if (
      keys.length !== 2 ||
      !keys.includes("id") ||
      !keys.includes("startedAt") ||
      typeof candidate.id !== "string" ||
      !uuidPattern.test(candidate.id) ||
      typeof candidate.startedAt !== "string"
    )
      throw new Error();
    const startedAt = new Date(candidate.startedAt);
    if (
      !Number.isFinite(startedAt.getTime()) ||
      startedAt.toISOString() !== candidate.startedAt
    ) {
      throw new Error();
    }
    return { id: candidate.id, startedAt };
  } catch {
    throw new ApiTransportValidationError();
  }
}

export function encodeLiveMapCursor(cursor: LiveMapCursor): string {
  return Buffer.from(
    JSON.stringify({
      id: cursor.id,
      startedAt: cursor.startedAt.toISOString(),
    }),
    "utf8",
  ).toString("base64url");
}
