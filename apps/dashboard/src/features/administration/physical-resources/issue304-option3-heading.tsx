import type { ReactNode } from "react";

export function Issue304Option3Heading(props: {
  readonly title: string;
  readonly kicker: "resource-create" | "parking-zone" | "resource-label";
  readonly locale: "ar" | "en";
  readonly onClose: () => void;
  readonly children?: ReactNode;
}) {
  const copy = {
    "resource-create": { en: "RESOURCE CREATION", ar: "إنشاء مورد" },
    "parking-zone": { en: "PARKING ZONE", ar: "منطقة وقوف" },
    "resource-label": { en: "RESOURCE LABEL", ar: "ملصق المورد" },
  } as const;
  // The real, persisted QR label is a preview of its current printable image.
  const heading = props.kicker === "resource-label"
    ? (props.locale === "ar" ? "معاينة ملصق المورد" : "Resource label preview")
    : props.title;
  return (
    <div className="issue304-modal-heading">
      <div className="issue304-modal-title">
        <span className="issue304-modal-kicker">
          {copy[props.kicker][props.locale]}
        </span>
        <h2>{heading}</h2>
      </div>
      <div className="issue304-modal-heading-actions">
        {props.children}
        <button
          aria-label={props.locale === "ar" ? "إغلاق" : "Close"}
          className="issue304-modal-close"
          onClick={props.onClose}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
