"use client";

import { useState } from "react";

export function useFoundationLogout(logout: () => Promise<void>) {
  const [logoutPending, setLogoutPending] = useState(false);
  const requestLogout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await logout();
    } catch {
      // Auth state becomes logout-unconfirmed and remains fail-closed.
    } finally {
      setLogoutPending(false);
    }
  };
  return { logoutPending, requestLogout };
}