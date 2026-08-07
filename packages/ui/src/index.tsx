import type { ReactNode } from "react";

export interface AppShellProps {
  children: ReactNode;
  title: string;
}

export function AppShell({ children, title }: AppShellProps) {
  return (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
