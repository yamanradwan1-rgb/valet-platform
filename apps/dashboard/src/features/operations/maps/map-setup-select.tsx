"use client";

import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

import { styles } from "../operations-ui";

export function MapSetupSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={styles.mapSelectControl}>
      <select {...props} className={styles.select} />
      <span
        aria-hidden="true"
        className={styles.mapSelectChevron}
        data-testid="map-setup-select-chevron"
      >
        <ChevronDown size={16} />
      </span>
    </div>
  );
}
