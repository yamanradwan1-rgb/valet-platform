import type { z } from "zod";

// Zod 4.6 counts code points in .min(). The prior wire contracts counted
// UTF-16 code units, so replacing the native check is necessary to accept
// valid astral Unicode at the old boundary without changing other checks.
export function utf16StringMin(minimum: number) {
  return (value: string, context: z.RefinementCtx) => {
    if (value.length < minimum) {
      context.addIssue({
        code: "too_small",
        origin: "string",
        minimum,
        inclusive: true,
      });
    }
  };
}
