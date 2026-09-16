export class StaffManagementConflictError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "StaffManagementConflictError";
  }
}

export function throwStaffManagementResult(code: string): never {
  const messages: Readonly<Record<string, string>> = {
    LAST_USABLE_ADMIN_REQUIRED: "Another usable Company Admin is required.",
    STAFF_ACCESS_INVALID_STATE: "The requested Staff access change is not valid now.",
    STAFF_HANDOVER_REQUIRED: "Operational handover is required before this change.",
    VERSION_CONFLICT: "The Staff membership changed before this request completed.",
  };
  throw new StaffManagementConflictError(
    code,
    messages[code] ?? "The Staff access change could not be completed.",
  );
}
