export interface PhotoMaintenanceEnvironment {
  NODE_ENV?: string;
  MIGRATION_DATABASE_URL?: string;
  DATABASE_URL?: string;
  CONDITION_PHOTO_MAINTENANCE_DATABASE_URL?: string;
  CONDITION_PHOTO_MAINTENANCE_ROLE?: string;
}

export interface PhotoMaintenancePolicy {
  maintenanceRole: string;
  migration: URL;
  migrationIdentity: {
    role: string;
    database: string;
    host: string;
    port: string;
  };
}

export function readConditionPhotoMaintenancePolicy(
  env: PhotoMaintenanceEnvironment,
): PhotoMaintenancePolicy;
