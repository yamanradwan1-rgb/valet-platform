import {
  liveSessionOverviewCursorSchema,
  type SessionOverviewFilter,
} from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { OverviewCursor } from "./overview-cursor";

// Separate strict domain from shared Vehicles /overview/sessions v2 cursors.
export function liveSessionOverviewCursor(scope: {
  readonly organizationId: string;
  readonly locationId: string;
  readonly filter: SessionOverviewFilter;
}) {
  return {
    decode(value?: string): OverviewCursor | null {
      if (value === undefined) return null;
      try {
        const bytes = Buffer.from(value, "base64url");
        if (bytes.toString("base64url") !== value) throw new Error();
        const result = liveSessionOverviewCursorSchema.parse(
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
        JSON.stringify({ v: 3, d: "live-sessions", ...scope, ...cursor }),
        "utf8",
      ).toString("base64url");
    },
  };
}
