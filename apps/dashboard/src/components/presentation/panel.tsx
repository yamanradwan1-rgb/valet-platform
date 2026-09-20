import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <section className={`panel ${className}`.trim()}>{children}</section>;
}

export function BidiText({
  children,
  kind = "code",
}: {
  readonly children: ReactNode;
  readonly kind?: "code" | "number";
}) {
  return (
    <bdi className={kind === "code" ? "bidi-code" : "bidi-number"} dir="ltr">
      {children}
    </bdi>
  );
}
