import { z } from "zod";

// Keep Zod's .max() metadata and normal error behavior. This extra check only
// rejects astral Unicode that Zod 4.6 counts as fewer than its UTF-16 units.
export function utf16StringMax(maximum: number) {
  return (value: string, context: z.RefinementCtx) => {
    if (value.length <= maximum) return;

    // Stop after maximum + 1 code points: Zod .max() already reports that case.
    const iterator = value[Symbol.iterator]();
    let count = 0;
    while (count <= maximum && !iterator.next().done) count++;
    if (count > maximum) return;

    context.addIssue({
      code: "too_big",
      origin: "string",
      maximum,
      inclusive: true,
    });
  };
}
