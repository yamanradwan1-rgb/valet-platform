import type { AnchorHTMLAttributes, ImgHTMLAttributes } from "react";

export function PreviewLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}

export function PreviewImage({
  priority: _priority,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  return <img {...props} />;
}
