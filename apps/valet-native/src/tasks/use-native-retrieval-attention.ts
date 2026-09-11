import { useEffect, useRef, useState } from "react";
import {
  EmployeeRetrievalAttentionOwner,
  type EmployeeOperationalSnapshot,
} from "@valet/employee-client";

export function useNativeRetrievalAttention(
  snapshot: EmployeeOperationalSnapshot,
  push: {
    readonly dismissAttention: (intentId: string) => void;
    readonly intentIds: readonly string[];
  },
) {
  const owner = useRef(new EmployeeRetrievalAttentionOwner());
  const [taskIds, setTaskIds] = useState<readonly string[]>([]);

  useEffect(() => {
    setTaskIds(owner.current.observe(snapshot));
  }, [snapshot]);

  return {
    attention: [
      ...taskIds.map((key) => ({ key, source: "polling" as const })),
      ...push.intentIds.map((key) => ({ key, source: "push" as const })),
    ],
    dismiss: (item: {
      readonly key: string;
      readonly source: "polling" | "push";
    }) => {
      if (item.source === "push") push.dismissAttention(item.key);
      else setTaskIds(owner.current.dismiss(item.key));
    },
  };
}
