"use client";

import type { DashboardApiError } from "../../lib/api/api-error";
import { useTranslation } from "../../i18n/locale-provider";

import { overviewErrorMessageKey } from "./error-message";

interface LoadMoreSectionProps {
  nextCursor: string | null;
  isLoadingMore: boolean;
  paginationError: DashboardApiError | null;
  onLoadMore: () => void;
}

/**
 * Cursor-pagination footer shared by the overview surfaces.
 *
 * - renders nothing once the backend reports `nextCursor === null`;
 * - Load More is disabled while a page request is in flight (duplicate
 *   concurrent calls are additionally dropped inside the hook);
 * - a pagination failure keeps loaded rows and offers a retry of the SAME
 *   opaque cursor.
 */
export function LoadMoreSection({
  nextCursor,
  isLoadingMore,
  paginationError,
  onLoadMore,
}: LoadMoreSectionProps) {
  const { t } = useTranslation();
  if (nextCursor === null && paginationError === null) return null;
  return (
    <div>
      {nextCursor !== null && (
        <button
          type="button"
          className="btn-load-more"
          disabled={isLoadingMore}
          onClick={onLoadMore}
        >
          {t("actions.loadMore")}
        </button>
      )}
      {paginationError !== null && (
        <div className="pagination-error" role="alert">
          <span>{t(overviewErrorMessageKey(paginationError))}</span>
          <button
            type="button"
            className="btn-secondary"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {t("actions.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
