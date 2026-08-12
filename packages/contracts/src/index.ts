import { z } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);

export * from "./api-errors.js";
export * from "./check-in.js";
export * from "./shifts.js";
export * from "./staff-auth.js";
