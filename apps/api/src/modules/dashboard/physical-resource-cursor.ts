import { ApiTransportValidationError } from "../../common/http/api-errors";

export type PhysicalResourceCursorDomain =
  | "key-slots"
  | "parking-spots"
  | "parking-zones";

interface CursorValue {
  readonly id: string;
  readonly sortKey: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function physicalResourceCursorCodec(
  domain: PhysicalResourceCursorDomain,
  locationId: string,
) {
  return {
    decode(value?: string): CursorValue | null {
      if (value === undefined) return null;
      try {
        const decoded: unknown = JSON.parse(
          Buffer.from(value, "base64url").toString("utf8"),
        );
        if (typeof decoded !== "object" || decoded === null) throw new Error();
        const item = decoded as Record<string, unknown>;
        if (
          Object.keys(item).length !== 5 ||
          item.v !== 1 ||
          item.d !== domain ||
          item.l !== locationId ||
          typeof item.s !== "string" ||
          item.s.length < 1 ||
          item.s.length > 160 ||
          typeof item.i !== "string" ||
          !uuidPattern.test(item.i)
        ) throw new Error();
        return { id: item.i, sortKey: item.s };
      } catch {
        throw new ApiTransportValidationError();
      }
    },
    encode(value: CursorValue): string {
      return Buffer.from(
        JSON.stringify({ v: 1, d: domain, l: locationId, s: value.sortKey, i: value.id }),
        "utf8",
      ).toString("base64url");
    },
  };
}
