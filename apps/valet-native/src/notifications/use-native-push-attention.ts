import type {
  EmployeeLocale,
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { useNativeRetrievalAttention } from "../tasks/use-native-retrieval-attention";
import { useNativePushLifecycle } from "./use-native-push-lifecycle";

export function useNativePushAttention(
  runtime: NativeEmployeeRuntime | undefined,
  auth: NativeAuthSnapshot,
  locale: EmployeeLocale,
  operations: EmployeeOperationalSnapshot,
) {
  const push = useNativePushLifecycle({ auth, locale, operations, runtime });
  const retrievalAttention = useNativeRetrievalAttention(operations, {
    dismissAttention: push.dismissAttention,
    intentIds: push.snapshot.attentionIntentIds,
  });
  return { push, retrievalAttention } as const;
}
