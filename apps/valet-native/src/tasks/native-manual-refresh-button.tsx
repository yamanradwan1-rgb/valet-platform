import { useState } from "react";

import { EmployeeButton } from "../employee-ui/employee-controls";

export function NativeManualRefreshButton({
  disabled,
  label,
  onRefresh,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly onRefresh: () => Promise<void>;
}) {
  const [manualRefreshing, setManualRefreshing] = useState(false);

  return (
    <EmployeeButton
      busy={manualRefreshing}
      disabled={disabled}
      label={label}
      onPress={() => {
        if (disabled || manualRefreshing) return;
        setManualRefreshing(true);
        void onRefresh().finally(() => setManualRefreshing(false));
      }}
      size="standard"
      variant="ghost"
    />
  );
}
