export class KeySlotOperationError extends Error {
  readonly code = "KEY_SLOT_NOT_FOUND_OR_UNAVAILABLE" as const;

  constructor() {
    super("The requested KeySlot is not available.");
    this.name = "KeySlotOperationError";
  }
}
