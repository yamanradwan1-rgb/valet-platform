"use client";

import type { KeyboardEvent } from "react";

import { styles } from "./administration-ui";

export function AdministrationTabs<T extends string>(props: {
  readonly active: T;
  readonly id: string;
  readonly label: string;
  readonly items: readonly { readonly value: T; readonly label: string }[];
  readonly onSelect: (value: T) => void;
  readonly inset?: boolean;
}) {
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const previous = rtl ? "ArrowRight" : "ArrowLeft";
    let target: number;
    if (event.key === "Home") target = 0;
    else if (event.key === "End") target = props.items.length - 1;
    else if (event.key === next) target = (index + 1) % props.items.length;
    else if (event.key === previous)
      target = (index + props.items.length - 1) % props.items.length;
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
      className={`${styles.tabs} ${styles.referenceTabs} ${props.inset ? styles.tabsInset : styles.brandingTabs}`}
      role="tablist"
    >
      {props.items.map((item, index) => (
        <button
          aria-controls={`${props.id}-panel-${item.value}`}
          aria-selected={props.active === item.value}
          className={`${styles.tab} ${styles.referenceTab} ${props.active === item.value ? `${styles.tabActive} ${styles.referenceTabActive}` : ""}`}
          id={`${props.id}-tab-${item.value}`}
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
