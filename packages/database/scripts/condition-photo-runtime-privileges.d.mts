import type {
  PhotoFormattedStatement,
  PhotoSqlClient,
} from "./condition-photo-privilege-policy.mjs";

export function provisionConditionPhotoRuntimePrivileges(
  client: PhotoSqlClient,
  executeFormatted: PhotoFormattedStatement,
  role: string,
): Promise<void>;

export function verifyConditionPhotoRuntimePrivileges(
  client: PhotoSqlClient,
  role: string,
): Promise<void>;
