import type {
  EmployeeConnectivityStatus,
  EmployeeLocale,
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import { retireNativeWorkflowScope } from "../shell/native-workflow-scope-retirement";
import type { ProductionShellController } from "../shell/production-shell-controller";
import { useNativeRetrievalAttention } from "../tasks/use-native-retrieval-attention";
import { useNativePushLifecycle } from "./use-native-push-lifecycle";
import { useNativePushResponse } from "./use-native-push-response";

export function useNativePushAttention(
  runtime: NativeEmployeeRuntime | undefined,
  auth: NativeAuthSnapshot,
  locale: EmployeeLocale,
  operations: EmployeeOperationalSnapshot,
  connectivity: EmployeeConnectivityStatus,
  controller: ProductionShellController,
  onRoute: () => void,
) {
  const push = useNativePushLifecycle({
    auth,
    connectivity,
    locale,
    operations,
    runtime,
  });
  const response = useNativePushResponse({
    auth,
    controller,
    onRoute: () => {
      if (runtime !== undefined) retireNativeWorkflowScope(runtime);
      onRoute();
    },
    operations,
    runtime,
  });
  const retrievalAttention = useNativeRetrievalAttention(operations, {
    dismissAttention: push.dismissAttention,
    intentIds: push.snapshot.attentionIntentIds,
  });
  return { push, response, retrievalAttention } as const;
}
