import { z } from "zod";

import { shiftPresenceOperationStatusResponseSchema } from "./shift-presence-public.js";
import { startShiftResponseSchema, endShiftResponseSchema } from "./shifts.js";

export const shiftPresenceRecoveryResponseSchema = z.discriminatedUnion(
  "state",
  [
    shiftPresenceOperationStatusResponseSchema.options[0],
    shiftPresenceOperationStatusResponseSchema.options[1],
    shiftPresenceOperationStatusResponseSchema.options[2]
      .safeExtend({
        result: z
          .union([startShiftResponseSchema, endShiftResponseSchema])
          .nullable(),
      })
      .strict(),
  ],
);
