import { Logger } from "@nestjs/common";

export type PlateOcrBoundaryClassification =
  | "auth-failure"
  | "auth-success"
  | "controller-to-service"
  | "cost-guard-acquired"
  | "cost-guard-denied"
  | "image-buffer-size-invalid"
  | "image-jpeg-magic-invalid"
  | "image-mime-invalid"
  | "image-missing"
  | "image-size-invalid"
  | "location-authorized"
  | "metadata-valid"
  | "multipart-accepted"
  | "provider-dispatch"
  | "request-authenticated"
  | "shift-eligible"
  | "shift-ineligible"
  | "tenant-policy-disabled";

const logger = new Logger("PlateOcrBoundary");

export function logPlateOcrBoundary(
  classification: PlateOcrBoundaryClassification,
): void {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test")
    return;
  logger.log(`PLATE_OCR_BOUNDARY ${classification}`);
}
