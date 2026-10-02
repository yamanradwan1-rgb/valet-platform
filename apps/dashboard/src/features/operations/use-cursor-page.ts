"use client";

import { useState } from "react";

export function useCursorPage() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly (string | null)[]>([]);
  return {
    cursor,
    canPrevious: history.length > 0,
    reset() {
      setCursor(null);
      setHistory([]);
    },
    previous() {
      const next = [...history];
      setCursor(next.pop() ?? null);
      setHistory(next);
    },
    next(nextCursor: string | null) {
      if (nextCursor === null) return;
      setHistory((items) => [...items, cursor]);
      setCursor(nextCursor);
    },
  };
}
