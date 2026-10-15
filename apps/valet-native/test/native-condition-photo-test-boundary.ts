import { vi } from "vitest";
import type {
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";
export { conditionPhotoTestScope } from "./native-condition-photo-test-scope";

vi.mock("../src/check-in/native-condition-photo-owner", () => ({
  useNativeConditionPhotoOwner: (
    _auth: unknown, _scope: unknown, checkIn: EmployeeCheckInSnapshot,
  ) => {
    const photoRequired = [
      "CHECK_IN_CONDITION_PHOTO_REQUIRED", "PHOTO_REQUIREMENT_NOT_SATISFIED",
    ].includes(checkIn.error?.code ?? "");
    return {
      files: {}, photo: {}, photoSnapshot: {
        scope: null, ownerRevision: 1, phase: "available",
        required: photoRequired, qualifying: false,
        captureRevision: 0, status: null, error: null, hasCapture: false,
      },
    };
  },
}));
vi.mock("../src/check-in/native-condition-photo-camera", () => ({
  NativeConditionPhotoCamera: "NativeConditionPhotoCamera",
}));
