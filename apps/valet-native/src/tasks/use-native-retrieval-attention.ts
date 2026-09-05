import { useEffect, useRef, useState } from "react";
import {
  EmployeeRetrievalAttentionOwner,
  type EmployeeOperationalSnapshot,
} from "@valet/employee-client";

export function useNativeRetrievalAttention(
  snapshot: EmployeeOperationalSnapshot,
) {
  const owner = useRef(new EmployeeRetrievalAttentionOwner());
  const [taskIds, setTaskIds] = useState<readonly string[]>([]);

  useEffect(() => {
    setTaskIds(owner.current.observe(snapshot));
  }, [snapshot]);

  return {
    dismiss: (taskId: string) => {
      setTaskIds(owner.current.dismiss(taskId));
    },
    taskIds,
  };
}
