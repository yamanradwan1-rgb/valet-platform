import { z } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);

export * from "./api-errors.js";
export * from "./check-in.js";
export * from "./confirm-parked.js";
export * from "./dispatch.js";
export * from "./key-custody.js";
export * from "./shifts.js";
export * from "./start-parking.js";
export * from "./staff-auth.js";
