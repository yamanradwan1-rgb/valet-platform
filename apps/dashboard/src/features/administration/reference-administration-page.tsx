"use client";

import type { ComponentProps } from "react";

import { AdministrationPage } from "./administration-ui";
import styles from "./reference-administration.module.css";

export function ReferenceAdministrationPage(
  props: ComponentProps<typeof AdministrationPage>,
) {
  return (
    <div className={styles.reference}>
      <AdministrationPage {...props} />
    </div>
  );
}
