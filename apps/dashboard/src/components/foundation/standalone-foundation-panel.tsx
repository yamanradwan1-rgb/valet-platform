"use client";

import type { ReactNode } from "react";

import { Panel } from "../presentation/panel";

export function StandaloneFoundationPanel({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="auth-card-wrap foundation-page">
      <Panel className="foundation-panel">
        <div className="stack">{children}</div>
      </Panel>
    </div>
  );
}