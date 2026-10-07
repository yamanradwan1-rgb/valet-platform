import { z } from "zod";

export const GUEST_BROWSER_CSRF_HEADER = "x-vaylet-guest-session";
export const GUEST_BROWSER_CSRF_VALUE = "v1";

export const guestBrowserPrepareResponseSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("ENROLLMENT_READY") }).strict(),
  z.object({ result: z.literal("SAME_VISIT") }).strict(),
  z
    .object({
      currentScope: z.enum(["ACTIVE", "POST_VISIT"]),
      result: z.literal("CONTEXT_CONFLICT"),
    })
    .strict(),
]);

export const guestBrowserSwitchResponseSchema = z
  .object({ result: z.enum(["SWITCHED", "RECOVERED"]) })
  .strict();

export const guestBrowserSwitchReconcileResponseSchema = z
  .object({ result: z.enum(["NONE", "RECOVERED"]) })
  .strict();

export type GuestBrowserPrepareResponse = z.infer<
  typeof guestBrowserPrepareResponseSchema
>;
export type GuestBrowserSwitchResponse = z.infer<
  typeof guestBrowserSwitchResponseSchema
>;
export type GuestBrowserSwitchReconcileResponse = z.infer<
  typeof guestBrowserSwitchReconcileResponseSchema
>;
