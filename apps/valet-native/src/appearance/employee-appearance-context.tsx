import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  employeeLightPalette,
  employeePalettes,
  type EmployeeAppearanceMode,
} from "./employee-palette";
import { NativeAppearanceOwner } from "./native-appearance-owner";
import { nativeAppearanceStore } from "./native-appearance-store";

const EmployeeAppearanceContext = createContext<{
  palette: typeof employeePalettes.light;
  ready: boolean;
  select: (mode: EmployeeAppearanceMode) => void;
}>({
  palette: employeeLightPalette,
  ready: true,
  select: () => {},
});

export function EmployeeAppearanceProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [owner] = useState(
    () => new NativeAppearanceOwner(nativeAppearanceStore),
  );
  const snapshot = useSyncExternalStore(owner.subscribe, owner.current);
  useEffect(() => {
    void owner.restore();
  }, [owner]);
  return (
    <EmployeeAppearanceContext.Provider
      value={{
        palette: employeePalettes[snapshot.mode],
        ready: snapshot.ready,
        select: owner.select,
      }}
    >
      {children}
    </EmployeeAppearanceContext.Provider>
  );
}

export function useEmployeeAppearance() {
  return useContext(EmployeeAppearanceContext);
}
export function useEmployeePalette() {
  return useEmployeeAppearance().palette;
}
export function useEmployeeStyles<T>(
  styles: Readonly<{ light: T; dark: T }>,
): T {
  return styles[useEmployeePalette().mode];
}
