import type { ReactElement } from "react";

/** Fully renders the existing pure row primitives and captures layout/text/accessibility. */
export function freezeTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(freezeTree);
  if (typeof value === "function" || value === undefined) return undefined;
  if (!value || typeof value !== "object") return value;
  if ("props" in value && "type" in value) {
    const node = value as ReactElement<Record<string, unknown>>;
    if (typeof node.type === "function")
      return freezeTree((node.type as (props: unknown) => unknown)(node.props));
    return { type: String(node.type), props: freezeTree(node.props) };
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "key")
      .map(([key, entry]) => [key, freezeTree(entry)])
      .filter(([, entry]) => entry !== undefined),
  );
}
