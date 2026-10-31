import { createContext, useContext, type ReactNode } from "react";
import type { Locale, Scalar } from "./catalog";
import type { LocalStore } from "./fixtures";
import type { PreviewRoute } from "./use-preview-route";

export interface StudioValue {
  route: PreviewRoute;
  locale: Locale;
  store: LocalStore;
  identity: string;
  editable: boolean;
  dirty: boolean;
  setDirty: (value: boolean) => void;
  defaults: Record<string, Scalar>;
  overrides: Record<string, Scalar>;
  save: (key: string, value: Scalar, clear?: boolean) => boolean;
  updateStore: (fn: (old: LocalStore) => LocalStore) => void;
  navigate: (patch: Partial<PreviewRoute>) => void;
  notice: string;
  announce: (message: string) => void;
}
const Studio = createContext<StudioValue | null>(null);
export function StudioProvider({
  value,
  children,
}: {
  value: StudioValue;
  children: ReactNode;
}) {
  return <Studio.Provider value={value}>{children}</Studio.Provider>;
}
export function useStudio() {
  const value = useContext(Studio);
  if (!value) throw new Error("Missing local studio context");
  return value;
}
