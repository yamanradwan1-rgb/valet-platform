import type {
  StaffPushProviderResult,
  StaffPushProviderSendResult,
} from "../src/modules/staff-push/staff-push-provider";

export function providerSendResult(
  result: StaffPushProviderResult,
): StaffPushProviderSendResult {
  return { kind: "PROVIDER_RESULT", result };
}
