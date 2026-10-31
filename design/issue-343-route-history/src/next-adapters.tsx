import type { AnchorHTMLAttributes, ImgHTMLAttributes } from 'react';

// Next's router/image runtime is unnecessary in this standalone Vite preview.
// Preserve the original shell's anchor/image markup, assets, sizes and CSS.
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
};

export default function NextPreviewAdapter({ priority: _priority, ...props }: Props) {
  if (props.src) return <img {...props} />;
  return <a {...props} onClick={(event) => {
    event.preventDefault();
    props.onClick?.(event);
  }} />;
}
