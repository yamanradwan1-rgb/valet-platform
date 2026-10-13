"use client";

import { useEffect, useState } from "react";

import type { ContextHelpKey } from "../../help/context-help-registry";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { styles } from "../administration-ui";

const mobileSettingHelpMedia = "(max-width: 700px)";

export function MobileSettingContextHelp({
  helpKey,
}: {
  readonly helpKey: ContextHelpKey;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(mobileSettingHelpMedia);
    const sync = () => setVisible(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (!visible) return null;

  return (
    <span className={styles.mobileSettingLabelHelp} data-mobile-setting-help="">
      <ScopedContextHelp helpKey={helpKey} />
    </span>
  );
}
