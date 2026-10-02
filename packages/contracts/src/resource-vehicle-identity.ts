import { z } from "zod";

export const resourceVehicleIdentitySchema = z
  .object({
    plateNumberNormalized: z.string().nullable(),
    temporaryDescriptor: z.string().nullable(),
  })
  .strict();

export type ResourceVehicleIdentity = z.infer<
  typeof resourceVehicleIdentitySchema
>;
