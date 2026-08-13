import { z } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);

export * from "./api-errors.js";
export * from "./check-in.js";
export * from "./complete-handoff.js";
export * from "./confirm-parked.js";
export * from "./dispatch.js";
export * from "./handoff.js";
export * from "./key-custody.js";
export * from "./mark-ready.js";
export * from "./shifts.js";
export * from "./start-parking.js";
export * from "./start-retrieval.js";
export * from "./staff-auth.js";
