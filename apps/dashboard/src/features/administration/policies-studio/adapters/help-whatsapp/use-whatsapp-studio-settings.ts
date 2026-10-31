"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import type { DashboardLocale } from "../../../../../lib/i18n/locale";
import type { WhatsAppSettingsView } from "../../../settings/whatsapp-settings-api";
import {
  readScopedWhatsAppStudio,
  saveScopedWhatsAppStudio,
  whatsappStudioDirty,
  type WhatsAppStudioDraft,
  type WhatsAppStudioPatch,
} from "./whatsapp-studio-policy";

interface State {
  readonly scopeKey: string;
  readonly view: WhatsAppSettingsView | null;
  readonly draft: WhatsAppStudioDraft | null;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly error: "load" | "save" | null;
}

export interface UseWhatsAppStudioSettingsProps {
  readonly api: DashboardApiClient;
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly locale: DashboardLocale;
  /** Scope/session/authority generation from the protected Dashboard owner. */
  readonly scopeIdentity: string;
  /** Explicit CA/section authority supplied by the owning protected route. */
  readonly enabled?: boolean;
  /** The owning Studio handles navigation/unsaved-draft confirmation. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

const initialState = (scopeKey: string): State => ({
  scopeKey,
  view: null,
  draft: null,
  loading: true,
  saving: false,
  error: null,
});

export function useWhatsAppStudioSettings({
  api,
  organizationId,
  locationId,
  locale,
  scopeIdentity,
  enabled = false,
  onDirtyChange,
}: UseWhatsAppStudioSettingsProps) {
  const scopeKey = JSON.stringify([
    organizationId,
    locationId,
    enabled,
    scopeIdentity,
  ]);
  const latestScope = useRef(scopeKey);
  const savingRef = useRef(false);
  const lastDirty = useRef<{ scope: string; dirty: boolean } | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [state, setState] = useState<State>(() => ({
    ...initialState(scopeKey),
    loading: enabled,
  }));
  const current = useMemo(
    () =>
      state.scopeKey === scopeKey
        ? state
        : {
            ...initialState(scopeKey),
            loading: enabled,
          },
    [state, scopeKey, enabled],
  );
  const dirty = whatsappStudioDirty(
    current.view?.policy ?? null,
    current.draft,
  );
  const ar = locale === "ar";

  useEffect(() => {
    latestScope.current = scopeKey;
  }, [scopeKey]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void readScopedWhatsAppStudio(
      api,
      organizationId,
      locationId,
      controller.signal,
    )
      .then((view) => {
        if (controller.signal.aborted || latestScope.current !== scopeKey)
          return;
        setState({
          scopeKey,
          view,
          draft: view.policy,
          loading: false,
          saving: false,
          error: null,
        });
      })
      .catch(() => {
        if (controller.signal.aborted || latestScope.current !== scopeKey)
          return;
        setState({
          ...initialState(scopeKey),
          loading: false,
          error: "load",
        });
      });
    return () => controller.abort();
  }, [api, organizationId, locationId, scopeKey, reloadVersion, enabled]);

  useEffect(() => {
    if (
      lastDirty.current?.scope === scopeKey &&
      lastDirty.current.dirty === dirty
    )
      return;
    lastDirty.current = { scope: scopeKey, dirty };
    onDirtyChange?.(dirty);
  }, [scopeKey, dirty, onDirtyChange]);

  const updateDraft = useCallback(
    (patch: WhatsAppStudioPatch) => {
      setState((old) =>
        old.scopeKey !== scopeKey || !old.draft || old.saving
          ? old
          : {
              ...old,
              draft: { ...old.draft, ...patch },
              error: null,
            },
      );
    },
    [scopeKey],
  );

  const reset = useCallback(() => {
    setState((old) =>
      old.scopeKey !== scopeKey || old.saving
        ? old
        : {
            ...old,
            draft: old.view?.policy ?? null,
            error: null,
          },
    );
  }, [scopeKey]);

  const reload = useCallback(() => {
    if (enabled && !savingRef.current) {
      setState(initialState(scopeKey));
      setReloadVersion((version) => version + 1);
    }
  }, [enabled, scopeKey]);

  const save = useCallback(async (): Promise<boolean> => {
    if (
      !enabled ||
      !current.view ||
      !current.draft ||
      !dirty ||
      savingRef.current
    )
      return false;
    const input = current.draft;
    savingRef.current = true;
    setState((old) =>
      old.scopeKey === scopeKey ? { ...old, saving: true, error: null } : old,
    );
    try {
      const view = await saveScopedWhatsAppStudio(
        api,
        organizationId,
        locationId,
        input,
      );
      if (latestScope.current !== scopeKey) return false;
      setState((old) =>
        old.scopeKey === scopeKey
          ? {
              ...old,
              view,
              draft: view.policy,
              saving: false,
              error: null,
            }
          : old,
      );
      return true;
    } catch {
      if (latestScope.current === scopeKey)
        setState((old) =>
          old.scopeKey === scopeKey
            ? {
                ...old,
                error: "save",
              }
            : old,
        );
      return false;
    } finally {
      savingRef.current = false;
      setState((old) =>
        old.scopeKey === scopeKey ? { ...old, saving: false } : old,
      );
    }
  }, [api, organizationId, locationId, scopeKey, current, dirty, enabled]);

  return {
    view: current.view,
    saved: current.view?.policy ?? null,
    draft: current.draft,
    loading: current.loading,
    saving: current.saving,
    error:
      current.error === "load"
        ? ar
          ? "تعذّر تحميل إعدادات واتساب."
          : "Could not load WhatsApp settings."
        : current.error === "save"
          ? ar
            ? "لم يُحفظ التغيير. أعد تحميل الإعدادات وتحقق من الصلاحيات."
            : "Change not saved. Reload settings and verify access."
          : null,
    dirty,
    updateDraft,
    reset,
    reload,
    save,
  };
}
