import { useEffect, useRef, useState } from "react";
import { helpadministration } from "../../../../apps/dashboard/src/features/help/help-administration";
import { helppages } from "../../../../apps/dashboard/src/features/help/help-pages";
import { helppresence } from "../../../../apps/dashboard/src/features/help/help-presence";
import { helpsettings } from "../../../../apps/dashboard/src/features/help/help-settings";
import type { PrototypeLocale } from "../types/variant";

const helpRegistry: Record<string, { en: { title: string; body: string }; ar: { title: string; body: string } }> = {
  ...helpadministration,
  ...helppages,
  ...helppresence,
  ...helpsettings,
};

export function HelpDialog({ helpKey, locale, fallback }: {
  readonly helpKey: string;
  readonly locale: PrototypeLocale;
  readonly fallback?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const help = helpRegistry[helpKey]?.[locale] ?? {
    title: fallback ?? (locale === "ar" ? "المساعدة" : "Help"),
    body: locale === "ar" ? "هذا الشرح مرتبط بالقسم المختار." : "Help for the selected section.",
  };

  useEffect(() => {
    const dialog = modal.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function dismiss() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  return <>
    <button ref={trigger} type="button" className="p321-help-button"
      aria-haspopup="dialog" aria-label={`${locale === "ar" ? "مساعدة" : "Help"}: ${help.title}`}
      onClick={() => setOpen(true)}>?</button>
    <dialog className="p321-help-dialog" ref={modal}
      aria-label={help.title} onCancel={e => { e.preventDefault(); dismiss(); }}
      onClose={() => { if (open) dismiss(); }}>
      <header><h2>{help.title}</h2><button type="button" className="button button-quiet"
        onClick={dismiss}>{locale === "ar" ? "إغلاق" : "Close"}</button></header>
      {help.body.split("\n\n").map((paragraph, i) => <p key={i}>{paragraph}</p>)}
    </dialog>
  </>;
}
