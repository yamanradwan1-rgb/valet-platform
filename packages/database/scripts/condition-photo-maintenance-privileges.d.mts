import type {
  PhotoFormattedStatement,
  PhotoSqlClient,
} from "./condition-photo-privilege-policy.mjs";

export function provisionConditionPhotoMaintenancePrivileges(
  client: PhotoSqlClient,
  executeFormatted: PhotoFormattedStatement,
  role: string,
): Promise<void>;

export function verifyConditionPhotoMaintenancePrivileges(
  client: PhotoSqlClient,
  role: string,
): Promise<void>;
