import type { ImgHTMLAttributes } from "react";

// Uses the source asset bytes/widths; the standalone prototype has no Next optimizer.
export default function NextImagePreview({ priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  return <img decoding="async" loading={priority ? "eager" : undefined} {...props} />;
}
