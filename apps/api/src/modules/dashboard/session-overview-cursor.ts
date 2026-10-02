import {
  sessionOverviewCursorSchema,
  type SessionOverviewFilter,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { OverviewCursor } from "./overview-cursor";

// Only created after location authorization; other overview domains keep v1.
export function sessionOverviewCursor(scope: {
  organizationId: string;
  locationId: string;
  filter: SessionOverviewFilter;
}) {
  return {
    decode(value?: string): OverviewCursor | null {
      if (value === undefined) return null;
      try {
        const bytes = Buffer.from(value, "base64url");
        if (bytes.toString("base64url") !== value) throw new Error();
        const result = sessionOverviewCursorSchema.parse(
          JSON.parse(bytes.toString("utf8")),
        );
        if (
          result.organizationId !== scope.organizationId ||
          result.locationId !== scope.locationId ||
          result.filter !== scope.filter
        ) {
          throw new Error();
        }
        return { sortKey: result.sortKey, tiebreakerId: result.tiebreakerId };
      } catch {
        throw new ApiTransportValidationError();
      }
    },
    encode(cursor: OverviewCursor): string {
      return Buffer.from(
        JSON.stringify({ v: 2, d: "sessions", ...scope, ...cursor }),
        "utf8",
      ).toString("base64url");
    },
  };
}
