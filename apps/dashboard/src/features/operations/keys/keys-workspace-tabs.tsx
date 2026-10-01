"use client";

import type { KeyboardEvent } from "react";

import { styles } from "../operations-ui";

export type KeysWorkspaceView = "operational" | "configuration";

export function KeysWorkspaceTabs(props: {
  readonly active: KeysWorkspaceView;
  readonly configurationLabel: string;
  readonly label: string;
  readonly onSelect: (value: KeysWorkspaceView) => void;
  readonly operationalLabel: string;
}) {
  const items: readonly {
    readonly label: string;
    readonly value: KeysWorkspaceView;
  }[] = [
    { label: props.operationalLabel, value: "operational" },
    { label: props.configurationLabel, value: "configuration" },
  ];

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const previous = rtl ? "ArrowRight" : "ArrowLeft";
    let target: number;
    if (event.key === "Home") target = 0;
    else if (event.key === "End") target = items.length - 1;
    else if (event.key === next) target = (index + 1) % items.length;
    else if (event.key === previous)
      target = (index + items.length - 1) % items.length;
    else return;
    event.preventDefault();
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
    tabs?.[target]?.focus();
  }

  return (
    <div
      aria-label={props.label}
      className={`${styles.tabs} ${styles.workspaceTabs}`}
      role="tablist"
    >
      {items.map((item, index) => (
        <button
          aria-controls={`keys-workspace-panel-${item.value}`}
          aria-selected={props.active === item.value}
          className={`${styles.tab} ${props.active === item.value ? styles.tabActive : ""}`}
          id={`keys-workspace-tab-${item.value}`}
          key={item.value}
          onClick={() => props.onSelect(item.value)}
          onKeyDown={(event) => moveFocus(event, index)}
          role="tab"
          tabIndex={props.active === item.value ? 0 : -1}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
