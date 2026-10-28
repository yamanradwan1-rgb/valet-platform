export class ConditionPhotoDecodeError extends Error {
  constructor(
    readonly code:
      | "CONDITION_PHOTO_INVALID_IMAGE"
      | "CONDITION_PHOTO_TOO_LARGE"
      | "CONDITION_PHOTO_STORAGE_UNAVAILABLE",
  ) {
    super("The condition photo could not be verified.");
  }
}
