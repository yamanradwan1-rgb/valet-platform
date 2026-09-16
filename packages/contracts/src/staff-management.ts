import { z } from "zod";

const uuidSchema = z.string().uuid();
const cursorSchema = z.string().regex(/^[A-Za-z0-9_-]{8,512}$/);

export const staffManagementRoleSchema = z.enum([
  "ORG_ADMIN",
  "LOCATION_MANAGER",
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
]);

export const staffManagementStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const staffDirectoryQuerySchema = z
  .object({
    cursor: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const staffManagementIdentitySchema = z
  .object({ email: z.string().email().max(320) })
  .strict();

export const staffManagementLocationAccessSchema = z
  .object({
    locationId: uuidSchema,
    name: z.string().min(1).max(200),
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict();

export const staffDirectoryItemSchema = z
  .object({
    identity: staffManagementIdentitySchema,
    locationAccessCount: z.number().int().nonnegative(),
    membershipId: uuidSchema,
    role: staffManagementRoleSchema,
    status: staffManagementStatusSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const staffDirectoryResponseSchema = z
  .object({
    items: z.array(staffDirectoryItemSchema).max(100),
    nextCursor: cursorSchema.nullable(),
  })
  .strict();

export const staffMembershipDetailSchema = staffDirectoryItemSchema
  .extend({
    locationAccess: z
      .object({
        items: z.array(staffManagementLocationAccessSchema).max(100),
        totalCount: z.number().int().nonnegative(),
        truncated: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const staffRoleCommandSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    role: staffManagementRoleSchema,
  })
  .strict();

export const staffStatusCommandSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

const locationIdsSchema = z
  .array(uuidSchema)
  .min(1)
  .max(50)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Duplicate Location IDs." });
    }
  });

export const staffLocationAccessCommandSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    locationIds: locationIdsSchema,
  })
  .strict();

export type StaffDirectoryItem = z.infer<typeof staffDirectoryItemSchema>;
export type StaffDirectoryQuery = z.infer<typeof staffDirectoryQuerySchema>;
export type StaffDirectoryResponse = z.infer<typeof staffDirectoryResponseSchema>;
export type StaffLocationAccessCommand = z.infer<
  typeof staffLocationAccessCommandSchema
>;
export type StaffManagementRole = z.infer<typeof staffManagementRoleSchema>;
export type StaffMembershipDetail = z.infer<typeof staffMembershipDetailSchema>;
export type StaffRoleCommand = z.infer<typeof staffRoleCommandSchema>;
export type StaffStatusCommand = z.infer<typeof staffStatusCommandSchema>;
