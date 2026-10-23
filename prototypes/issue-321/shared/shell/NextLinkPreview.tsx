import type { AnchorHTMLAttributes, MouseEvent } from "react";

// Only the Next router behavior is simulated. The real Dashboard Link DOM/CSS is retained.
export default function NextLinkPreview({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (!event.defaultPrevented) event.preventDefault();
  }
  return <a href={href} onClick={handleClick} {...props} />;
}
