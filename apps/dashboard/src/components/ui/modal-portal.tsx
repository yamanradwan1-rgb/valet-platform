"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/** Keeps modal content outside the inert Dashboard application shell. */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}
