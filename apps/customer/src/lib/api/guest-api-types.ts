import type {
  guestSafeSessionResponseSchema,
  guestHandoffMaterialResponseSchema,
  handoffStandardMethodSchema,
} from '@valet/contracts';
import type { z } from 'zod';

export type GuestSafeSession = z.infer<typeof guestSafeSessionResponseSchema>;
export type GuestSessionState = GuestSafeSession['state'];

export type HandoffStandardMethod = z.infer<typeof handoffStandardMethodSchema>;
export type GuestHandoffMaterial = z.infer<typeof guestHandoffMaterialResponseSchema>;

export type PickupCodeHandoffMaterial = Extract<
  GuestHandoffMaterial,
  { method: 'PICKUP_CODE' }
>;

export type DynamicQrHandoffMaterial = Extract<
  GuestHandoffMaterial,
  { method: 'DYNAMIC_QR' }
>;
