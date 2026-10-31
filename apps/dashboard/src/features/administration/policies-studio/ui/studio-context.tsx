"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale, Scalar } from "./catalog";
import type {
  PoliciesStudioAdapter,
  StudioRoute,
  StudioSaveResult,
} from "./studio-types";

export interface StudioValue {
  readonly route: StudioRoute;
  readonly locale: Locale;
  readonly adapter: PoliciesStudioAdapter;
  readonly identity: string;
  readonly editable: boolean;
  readonly dirty: boolean;
  readonly notice: string;
  setDirty(value: boolean): void;
  save(
    key: string,
    value: Scalar,
    clear?: boolean,
    strictConfirmed?: boolean,
  ): Promise<StudioSaveResult>;
  navigate(patch: Partial<StudioRoute>): void;
  announce(message: string): void;
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

export function useStudio(): StudioValue {
  const value = useContext(Studio);
  if (!value) throw new Error("Missing Policies Studio context");
  return value;
}
