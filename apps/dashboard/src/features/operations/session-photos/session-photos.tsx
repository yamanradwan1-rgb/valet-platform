"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { acquireSessionPhotosInOrder } from "./photo-download-scheduler";
import { makeSessionPhotoTransport, photoErrorState, type SessionPhotoTransport } from "./photo-client";
import styles from "./session-photos.module.css";

type Locale = "en" | "ar";
type PhotoPhase = "loading" | "ready" | "empty" | "unavailable" | "error" | "denied";
type ImageEntry = { readonly url: string; readonly photoId: string; readonly verifiedAt?: string };
type PhotoState = { readonly phase: PhotoPhase; readonly images: readonly ImageEntry[] };

const copy = {
  en: {
    title: "Check-in condition photos",
    hint: "Verified upload evidence for this visit only. Does not establish vehicle damage or authenticity.",
    photo: "photo", photos: "photos", unknown: "—", close: "Close",
    emptyTitle: "No verified check-in photos", emptyDesc: "There are no eligible photos for this visit.",
    unavailableTitle: "Photos currently unavailable", unavailableDesc: "Image delivery is currently unavailable. No photo is displayed.",
    errorTitle: "Photos could not be loaded", errorDesc: "The request failed. Try again when the connection is available.",
    deniedTitle: "Photo access unavailable", deniedDesc: "Access to photo evidence is not authorized for this context.",
    loadingTitle: "Loading condition photos", loadingDesc: "Checking availability for this specific visit…",
    retry: "Retry", of: "of", previous: "Previous photo", next: "Next photo",
    verified: "Verified upload", hintKeys: "Esc closes · Left/Right navigate · Tab stays inside",
    image: "Check-in photo",
  },
  ar: {
    title: "صور حالة السيارة عند الاستلام",
    hint: "ملفات تم التحقق من رفعها لهذه الزيارة فقط. لا تثبت وجود ضرر أو أصالة الصورة.",
    photo: "صورة", photos: "صور", unknown: "—", close: "إغلاق",
    emptyTitle: "لا توجد صور استلام موثّقة", emptyDesc: "لا تتوفر صور مؤهلة لهذه الزيارة.",
    unavailableTitle: "الصور غير متاحة حالياً", unavailableDesc: "تعذّر توفير الصور حالياً، لذلك لا يتم عرض أي صورة.",
    errorTitle: "تعذّر تحميل الصور", errorDesc: "فشل الطلب. أعد المحاولة عند توفر الاتصال.",
    deniedTitle: "الوصول للصور غير متاح", deniedDesc: "عرض أدلة الصور غير مصرّح به ضمن هذا السياق.",
    loadingTitle: "جارٍ تحميل صور السيارة", loadingDesc: "جارٍ التحقق من التوفر لهذه الزيارة تحديداً…",
    retry: "إعادة المحاولة", of: "من", previous: "الصورة السابقة", next: "الصورة التالية",
    verified: "رفع موثّق", hintKeys: "Esc للإغلاق · الأسهم للتنقل · Tab داخل العارض",
    image: "صورة الاستلام",
  },
} as const;

export interface SessionPhotosProps {
  readonly api?: DashboardApiClient | undefined;
  readonly locationId: string;
  readonly sessionId: string;
  readonly locale: Locale;
  readonly timezone: string;
  readonly scopeKey?: string | undefined;
  // Isolated injection for tests; absent provider/authority never exposes images.
  readonly transport?: SessionPhotoTransport | undefined;
}

const initial: PhotoState = { phase: "loading", images: [] };

export function SessionPhotos({ api, locationId, sessionId, locale, timezone, scopeKey, transport }: SessionPhotosProps) {
  const t = copy[locale];
  const viewerTitleId = useId();
  const viewerDescriptionId = useId();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<PhotoState>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const alive = useRef(true);
  const section = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const viewerCloseRef = useRef<HTMLButtonElement>(null);
  const photoTransport = useMemo(() => transport ?? (api === undefined ? null : makeSessionPhotoTransport(api)), [api, transport]);
  // No privileged API or scope identity => default deny. Never resolve public URLs.
  const authorizedContext = Boolean(scopeKey && locationId && sessionId && photoTransport);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const allocated: string[] = [];
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) {
        setSelected(null);
        setState(initial);
      }
    });
    if (!authorizedContext || photoTransport === null) {
      queueMicrotask(() => {
        if (!disposed) setState({ phase: "denied", images: [] });
      });
      return () => { alive.current = false; disposed = true; controller.abort(); };
    }
    const run = async () => {
      try {
        const manifest = await photoTransport.list(locationId, sessionId, controller.signal);
        if (disposed || controller.signal.aborted) return;
        if (manifest.length === 0) {
          setState({ phase: "empty", images: [] });
          return;
        }
        const next = await acquireSessionPhotosInOrder(manifest, async (photo, _index, readSignal): Promise<ImageEntry> => {
          const blob = await photoTransport.read(locationId, sessionId, photo.photoId, readSignal);
          if (disposed || readSignal.aborted) throw new DOMException("Aborted", "AbortError");
          if (blob.type !== "image/jpeg" || blob.size < 4 || blob.size > 8 * 1024 * 1024) {
            throw new Error("Invalid private JPEG.");
          }
          const url = URL.createObjectURL(blob);
          allocated.push(url);
          return { url, photoId: photo.photoId, ...(photo.verifiedAt === undefined ? {} : { verifiedAt: photo.verifiedAt }) };
        }, controller.signal);
        if (!disposed && !controller.signal.aborted) {
          setState({ phase: "ready", images: next });
        }
      } catch (error: unknown) {
        if (!disposed && !controller.signal.aborted) {
          allocated.splice(0).forEach((url) => URL.revokeObjectURL(url));
          setState({ phase: photoErrorState(error), images: [] });
        }
      }
    };
    void run();
    return () => {
      alive.current = false;
      disposed = true;
      controller.abort();
      allocated.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [authorizedContext, locationId, sessionId, scopeKey, revision, photoTransport]);

  const closeViewer = useCallback(() => { if (alive.current) setSelected(null); }, []);
  const isViewerOpen = selected !== null;
  useEffect(() => {
    if (!isViewerOpen) return;
    const drawer = section.current?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]') ?? null;
    if (drawer) drawer.inert = true;
    viewerCloseRef.current?.focus();
    return () => {
      if (drawer) drawer.inert = false;
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, [isViewerOpen]);

  // If the authority, location, session or manifest changes, close modal immediately.
  const count = state.phase === "ready" ? state.images.length : 0;
  const viewing = selected !== null && count > 0 ? ((selected % count) + count) % count : null;
  const updateIndex = (delta: number) => setSelected((value) => value === null || count < 2 ? value : (value + delta + count) % count);

  const onViewerKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); closeViewer(); }
    else if (event.key === "ArrowLeft") { event.stopPropagation(); event.preventDefault(); updateIndex(locale === "ar" ? 1 : -1); }
    else if (event.key === "ArrowRight") { event.stopPropagation(); event.preventDefault(); updateIndex(locale === "ar" ? -1 : 1); }
    else if (event.key === "Tab") {
      const panel = event.currentTarget;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled])"));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }
  };

  const description = state.phase === "ready" ? null : t[(state.phase + "Desc") as keyof typeof t];
  const stateTitle = state.phase === "ready" ? null : t[(state.phase + "Title") as keyof typeof t];

  return (
    <section className={styles.photoSection} aria-labelledby="session-photo-heading" ref={section}>
      <div className={styles.photoHeading}>
        <h3 id="session-photo-heading">{t.title}</h3>
        <span className={styles.photoCount}>
          {state.phase === "ready" || state.phase === "empty"
            ? String(count) + " " + (count === 1 ? t.photo : t.photos)
            : t.unknown}
        </span>
      </div>
      <p className={styles.photoHint}>{t.hint}</p>
      <div aria-live="polite" aria-relevant="additions text">
        {state.phase === "ready" ? (
          <div className={styles.photoGrid} aria-label={t.title}>
            {state.images.map((photo, i) => (
              <button
                aria-label={t.image + " " + (i + 1)}
                className={styles.photoTile}
                key={photo.photoId}
                onClick={(event) => { previousFocus.current = event.currentTarget; setSelected(i); }}
                type="button"
              >
                {/* Private blob URLs are created only after protected, authenticated reads. */}
                <img alt={t.image + " " + (i + 1)} src={photo.url} />
                <span className={styles.tileCaption}>
                  <strong>{t.image} {i + 1}</strong>
                  <small>{t.verified}{photo.verifiedAt ? " · " + new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(photo.verifiedAt)) : ""}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.photoMessage} role={state.phase === "error" ? "alert" : "status"} aria-busy={state.phase === "loading"}>
            <span className={styles.stateGlyph} aria-hidden="true">{state.phase === "loading" ? "◌" : state.phase === "error" ? "!" : state.phase === "empty" ? "▧" : state.phase === "denied" ? "⊗" : "⊘"}</span>
            <strong>{stateTitle}</strong><p>{description}</p>
            {state.phase === "error" ? <button onClick={() => setRevision((x) => x + 1)} type="button">{t.retry}</button> : null}
          </div>
        )}
      </div>
      {viewing !== null && typeof document !== "undefined" ? createPortal(
        <div className={styles.viewerBackdrop} onMouseDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) closeViewer(); }}>
          <section
            aria-labelledby={viewerTitleId}
            aria-describedby={viewerDescriptionId}
            aria-modal="true"
            className={styles.viewer}
            onKeyDown={onViewerKey}
            role="dialog"
            tabIndex={-1}
          >
            <header className={styles.viewerHeader}>
              <div><h2 id={viewerTitleId}>{t.title}</h2><div className={styles.viewerCount}>{viewing + 1} {t.of} {count}</div></div>
              <button aria-label={t.close} className={styles.viewerClose} onClick={closeViewer} ref={viewerCloseRef} type="button"><X size={18} /></button>
            </header>
            <div className={styles.viewerCanvas}>
              <button aria-label={t.previous} className={styles.viewerArrow} disabled={count < 2} onClick={() => updateIndex(-1)} type="button">{locale === "ar" ? "›" : "‹"}</button>
              <img alt={t.image + " " + (viewing + 1)} src={state.images[viewing]!.url} />
              <button aria-label={t.next} className={styles.viewerArrow} disabled={count < 2} onClick={() => updateIndex(1)} type="button">{locale === "ar" ? "‹" : "›"}</button>
            </div>
            <footer className={styles.viewerFooter}>
              <strong id={viewerDescriptionId}>{t.image} {viewing + 1}</strong>
              <span>{t.verified}</span>
              <span className={styles.arrowsHint}>{t.hintKeys}</span>
            </footer>
          </section>
        </div>, document.body,
      ) : null}
    </section>
  );
}
