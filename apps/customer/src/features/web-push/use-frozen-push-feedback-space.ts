"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Reserve the existing paragraph's geometry when its authorized feedback changes. */
export function useFrozenPushFeedbackSpace(
  baseline: string,
  hasFeedback: boolean,
) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const paragraph = ref.current;
    if (!hasFeedback || !paragraph?.cloneNode || !paragraph.parentElement)
      return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const probe = paragraph.cloneNode(false) as HTMLParagraphElement;
      probe.textContent = baseline;
      Object.assign(probe.style, {
        position: "absolute",
        visibility: "hidden",
        pointerEvents: "none",
        width: `${paragraph.getBoundingClientRect().width}px`,
        minHeight: "",
        height: "auto",
      });
      paragraph.parentElement!.appendChild(probe);
      const measured = probe.getBoundingClientRect().height;
      probe.remove();
      setHeight(measured);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(paragraph);
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => {
      alive = false;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [baseline, hasFeedback]);
  return { ref, minHeight: hasFeedback ? height : undefined };
}
