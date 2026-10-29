import { EmployeeApiError } from "./api-error";

/** Losing this photo scope revokes local preview ownership immediately. */
export function conditionPhotoAuthorizationLost(error: unknown): boolean {
  return error instanceof EmployeeApiError &&
    (error.status === 401 || error.status === 403);
}
