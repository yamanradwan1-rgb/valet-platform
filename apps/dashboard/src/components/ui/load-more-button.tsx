"use client";

interface LoadMoreButtonProps {
  onClick: () => void;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  label: string;
  loadingLabel?: string | undefined;
}

/**
 * Full-width Load More control under cursor-paginated lists. Disabled while a
 * page request is running so concurrent loads cannot be triggered.
 */
export function LoadMoreButton({
  onClick,
  disabled,
  loading,
  label,
  loadingLabel,
}: LoadMoreButtonProps) {
  const isBusy = loading === true;
  return (
    <div className="load-more-row">
      <button
        type="button"
        className="load-more-button"
        onClick={onClick}
        disabled={disabled === true || isBusy}
      >
        {isBusy ? (loadingLabel ?? label) : label}
      </button>
    </div>
  );
}
