import { useEffect, useId, useRef, useState } from "react";
import type { PrototypeLocale } from "../types/variant";
import { HelpDialog } from "./HelpDialog";

type View = "PENDING" | "HISTORY";
type Result = "PENDING" | "APPROVED" | "REJECTED";

function ReviewDialog({ locale, allowed, onClose, onDecision }: {
  locale: PrototypeLocale;
  allowed: boolean;
  onClose: () => void;
  onDecision: (result: "APPROVED" | "REJECTED") => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const ar = locale === "ar";
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); opener.current?.focus(); };
  }, []);
  return <dialog className="p321-zone-dialog p321-exception-dialog" ref={dialog}
    aria-labelledby="p321-exception-dialog-heading" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="p321-exception-dialog-body">
      <header><h2 id="p321-exception-dialog-heading">{ar ? "مراجعة طلب حضور تجريبي" : "Review synthetic presence request"}</h2>
        <div className="p321-pane-tools"><HelpDialog helpKey="presence.review" locale={locale} />
          <button className="p321-outline" type="button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>✕</button></div></header>
      <p className="p321-zone-hint">{ar
        ? "هذه بيانات تم إنشاؤها لاختبار شكل الواجهة؛ لا تمثل موظفًا أو طلبًا حقيقيًا."
        : "This fixture was created for UI inspection; no actual employee or request exists."}</p>
      <dl className="p321-exception-facts">
        <div><dt>{ar ? "مقدّم الطلب" : "Requester"}</dt><dd>{ar ? "موظف تجريبي" : "Sample employee (fictional)"}</dd></div>
        <div><dt>{ar ? "الإجراء" : "Action"}</dt><dd>{ar ? "بدء الوردية" : "Start Shift"}</dd></div>
        <div><dt>{ar ? "السبب" : "Reason"}</dt><dd>{ar ? "خارج منطقة الحضور" : "Outside attendance zone"}</dd></div>
        <div><dt>{ar ? "الموقع" : "Location"}</dt><dd>{ar ? "الموقع التجريبي المحدد" : "Selected sample Location"}</dd></div>
        <div><dt>{ar ? "الصلاحية" : "Authority"}</dt><dd>{allowed ? (ar ? "محاكاة سماح" : "Allowed in simulation") :
          (ar ? "لا تملك صلاحية المراجعة" : "No review capability")}</dd></div>
      </dl>
      <p className="p321-zone-hint">{ar
        ? "في المنتج الحقيقي تُراجع هوية الطالب والإجراء والموقع والصلاحيات الحالية والتحقق متعدد العوامل والإصدار. لا تبدأ الموافقة الوردية؛ على الموظف متابعة الإجراء بنفسه."
        : "Production verifies exact requester, action, Location, current authority, MFA and revision. Approval never starts a shift; the employee must continue the exact action."}</p>
      <footer>
        <button type="button" className="p321-outline" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button>
        {allowed && <>
          <button type="button" className="p321-outline" onClick={() => {
            if (window.confirm(ar ? "رفض الطلب التجريبي؟" : "Reject synthetic request?")) onDecision("REJECTED");
          }}>{ar ? "رفض (محاكاة)" : "Reject (simulated)"}</button>
          <button type="button" className="p321-save" onClick={() => {
            if (window.confirm(ar ? "محاكاة الموافقة فقط؛ لم يُنفّذ MFA فعلي. هل تتابع؟" :
              "Simulate approval only; no real MFA took place. Continue?")) onDecision("APPROVED");
          }}>{ar ? "موافقة (محاكاة)" : "Approve (simulated)"}</button>
        </>}
      </footer>
    </div>
  </dialog>;
}

export function PresenceExceptionsPreview({ locale, canReview }: {
  locale: PrototypeLocale;
  canReview: boolean;
}) {
  const ar = locale === "ar";
  const id = useId();
  const [view, setView] = useState<View>("PENDING");
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<Result>("PENDING");
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewOpener = useRef<HTMLButtonElement | null>(null);
  const [message, setMessage] = useState("");
  const showRequest = loaded && (view === "PENDING" ? result === "PENDING" : result !== "PENDING");
  return <div className="p321-presence-panel p321-presence-exceptions" aria-labelledby={id + "-heading"}>
    <div className="p321-special-head"><h3 id={id + "-heading"}>{ar ? "استثناءات الحضور" : "Presence exceptions"}</h3>
      <HelpDialog helpKey="presence.exceptions" locale={locale} /></div>
    <p>{ar ? "الموافقات تخص طلبات بدء/إنهاء محددة ولا تنفّذ إجراء الوردية." :
      "Approvals relate to exact Start/End requests and do not execute the shift action."}</p>
    <div className="p321-presence-scope" role="group" aria-label={ar ? "عرض الاستثناءات" : "Exceptions view"}>
      {(["PENDING", "HISTORY"] as const).map(key => <button key={key} type="button" aria-pressed={view === key}
        onClick={() => setView(key)}>{key === "PENDING" ? (ar ? "المعلّقة" : "Pending") : (ar ? "السجل" : "History")}</button>)}
      <button type="button" onClick={() => setMessage(ar ? "تحديث محلي فقط؛ لم تُجلب طلبات حقيقية." :
        "Local preview refreshed. No real requests were fetched.")}>{ar ? "تحديث" : "Refresh"}</button>
    </div>
    {!canReview && <p className="p321-zone-hint">{ar ?
      "الصلاحية التجريبية الحالية لا تسمح بالموافقة أو الرفض." :
      "The current simulated capability cannot approve or reject requests."}</p>}
    {showRequest ? <div className="p321-exception-sample">
      <div><span className="p321-tag">{ar ? "طلب تجريبي 100٪" : "Synthetic request · no real employee"}</span>
        <h4>{ar ? "موظف تجريبي · بدء الوردية" : "Fictional employee · Start Shift"}</h4>
        <p>{ar ? "السبب: خارج منطقة الحضور" : "Reason: Outside attendance zone"} ·
          {" "}{result === "PENDING" ? (ar ? "معلّق" : "Pending") :
            result === "APPROVED" ? (ar ? "موافق عليه (محاكاة)" : "Approved (simulated)") :
              (ar ? "مرفوض (محاكاة)" : "Rejected (simulated)")}</p></div>
      <button className="p321-outline p321-review-button" type="button" onClick={event => {
        reviewOpener.current = event.currentTarget;
        setReviewOpen(true);
      }}>
        {result === "PENDING" && canReview ? (ar ? "مراجعة" : "Review") : (ar ? "التفاصيل" : "Details")}</button>
    </div> : <div className="p321-empty" role="status">{view === "PENDING"
      ? (ar ? "لا توجد طلبات معلّقة في هذه المعاينة" : "No pending requests in this preview")
      : (ar ? "لا توجد طلبات في السجل التجريبي" : "No synthetic request history")}</div>}
    {!loaded && <button type="button" className="p321-outline p321-exception-load" onClick={() => {
      setLoaded(true); setResult("PENDING"); setView("PENDING"); setMessage("");
    }}>{ar ? "تحميل طلب تجريبي لاختبار شاشة المراجعة" : "Load a fictional request to inspect the review flow"}</button>}
    {loaded && <button type="button" className="p321-outline p321-exception-load" onClick={() => {
      setLoaded(false); setResult("PENDING"); setReviewOpen(false); setMessage("");
    }}>{ar ? "إزالة بيانات الاختبار" : "Remove synthetic request"}</button>}
    {message && <p className="p321-zone-hint" role="status">{message}</p>}
    {reviewOpen && <ReviewDialog locale={locale} allowed={canReview && result === "PENDING"}
      onClose={() => { setReviewOpen(false); requestAnimationFrame(() => reviewOpener.current?.focus({ preventScroll: true })); }} onDecision={decision => {
        setResult(decision); setView("HISTORY"); setReviewOpen(false);
        requestAnimationFrame(() => reviewOpener.current?.focus({ preventScroll: true }));
        setMessage(ar ? "تغيّرت حالة الطلب التجريبي في الذاكرة فقط." : "Only the fictional in-memory request was updated.");
      }} />}
  </div>;
}
