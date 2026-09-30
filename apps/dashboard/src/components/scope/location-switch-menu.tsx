"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import type { useLocationSwitcher } from "./use-location-switcher";
import styles from "./location-switch-menu.module.css";

type Controller = ReturnType<typeof useLocationSwitcher>;

export function LocationSwitchMenu({
  controller,
  labels,
  selectedLabel,
}: {
  readonly controller: Controller;
  readonly labels: {
    readonly allLocations: string;
    readonly changeScope: string;
    readonly inactiveHistorical: string;
    readonly loadError: string;
    readonly loadMore: string;
    readonly loading: string;
    readonly noneAvailable: string;
    readonly retry: string;
    readonly selectLocation: string;
  };
  readonly selectedLabel: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wasOpen = useRef(false);
  const listboxId = useId();
  const options = menuOptions(controller, labels);

  useEffect(() => {
    if (controller.open && controller.status === "ready") {
      const selectedIndex = options.findIndex(
        (option) => option.key === controller.selectedKey,
      );
      optionRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus();
    }
  }, [
    controller.open,
    controller.selectedKey,
    controller.status,
    options.length,
  ]);

  useEffect(() => {
    if (wasOpen.current && !controller.open) triggerRef.current?.focus();
    wasOpen.current = controller.open;
  }, [controller.open]);

  useEffect(() => {
    if (!controller.open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node))
        controller.dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [controller.dismiss, controller.open]);

  const focusOption = (index: number) => {
    if (options.length === 0) return;
    const normalized = (index + options.length) % options.length;
    optionRefs.current[normalized]?.focus();
  };

  const onOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      controller.dismiss();
    }
  };

  return (
    <div className={styles.anchor} ref={anchorRef}>
      <button
        aria-controls={controller.open ? listboxId : undefined}
        aria-expanded={controller.open}
        aria-haspopup="listbox"
        aria-label={labels.changeScope}
        className="location-context"
        onClick={controller.toggle}
        onKeyDown={(event) => {
          if (
            !controller.open &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
          ) {
            event.preventDefault();
            controller.toggle();
          } else if (controller.open && event.key === "Escape") {
            event.preventDefault();
            controller.dismiss();
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <MapPin aria-hidden="true" size={18} />
        <bdi className="location-context-value">{selectedLabel}</bdi>
        <ChevronDown
          aria-hidden="true"
          className="location-context-chevron"
          size={14}
        />
      </button>
      {controller.open ? (
        <div className={styles.menu} data-testid="location-switch-menu">
          {controller.status === "loading" &&
          controller.locations.length === 0 ? (
            <p className={styles.state} role="status">
              {labels.loading}
            </p>
          ) : controller.status === "error" &&
            controller.locations.length === 0 ? (
            <div role="alert">
              <p className={`${styles.state} ${styles.error}`}>
                {labels.loadError}
              </p>
              <button
                className={styles.action}
                onClick={controller.retry}
                type="button"
              >
                {labels.retry}
              </button>
            </div>
          ) : options.length === 0 ? (
            <p className={styles.state} role="status">
              {labels.noneAvailable}
            </p>
          ) : (
            <div
              aria-busy={controller.pendingKey !== null}
              aria-label={labels.selectLocation}
              className={styles.list}
              id={listboxId}
              role="listbox"
            >
              {options.map((option, index) => (
                <button
                  aria-selected={controller.selectedKey === option.key}
                  className={styles.option}
                  disabled={controller.pendingKey === option.key}
                  key={option.key}
                  onClick={option.select}
                  onKeyDown={(event) => onOptionKeyDown(event, index)}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  role="option"
                  type="button"
                >
                  <bdi>{option.label}</bdi>
                  {option.meta ? (
                    <span className={styles.meta}>{option.meta}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
          {controller.selectionError ? (
            <p className={`${styles.state} ${styles.error}`} role="alert">
              {labels.loadError}
            </p>
          ) : null}
          {controller.loadMore ? (
            <div className={styles.actions}>
              <button
                className={styles.action}
                onClick={controller.loadMore}
                type="button"
              >
                {labels.loadMore}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function menuOptions(
  controller: Controller,
  labels: Parameters<typeof LocationSwitchMenu>[0]["labels"],
) {
  const all = controller.canShowAllLocations
    ? [
        {
          key: "all-locations",
          label: labels.allLocations,
          meta: null,
          select: () =>
            controller.selectCandidate({ kind: "ALL_LOCATIONS" as const }),
        },
      ]
    : [];
  return [
    ...all,
    ...controller.locations.map((location) => ({
      key: `location:${location.locationId}`,
      label: location.name,
      meta: location.status === "INACTIVE" ? labels.inactiveHistorical : null,
      select: () =>
        controller.selectCandidate({ kind: "LOCATION" as const, location }),
    })),
  ];
}
