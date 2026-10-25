"use client";

import { useRef, useState } from "react";
import {
  incidentOverviewEntrySchema,
  incidentResolutionRequestSchema,
  type IncidentOverviewEntry,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { SensitiveMfaDialog } from "../../administration/sensitive-mfa-dialog";
import { useSensitiveMutation } from "../../administration/use-sensitive-mutation";
import { styles } from "../operations-ui";

export function ResolveIncidentControl({
  api,
  locationId,
  item,
  onResolved,
  onRefresh,
}: {
  readonly api: DashboardApiClient;
  readonly locationId: string;
  readonly item: IncidentOverviewEntry;
  readonly onResolved: (item: IncidentOverviewEntry) => void;
  readonly onRefresh: () => void;
}) {
  const { locale } = useDashboardLocale();
  const ar = locale === "ar";
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const intent = useRef({ note: "", operationId: crypto.randomUUID() });
  const mutation = useSensitiveMutation(
    `resolve:${item.incidentId}:${item.status}`,
    onRefresh,
  );
  if (item.status !== "OPEN" && item.status !== "INVESTIGATING") return null;
  async function resolve() {
    if (
      mutation.busy ||
      !note.trim() ||
      !window.confirm(
        ar
          ? "تأكيد تحديد هذا الحادث كمحلول؟ سيُحفظ السبب وهوية المعالج."
          : "Mark this incident Resolved? The resolution note and your identity will be saved.",
      )
    )
      return;
    if (intent.current.note !== note.trim()) {
      intent.current = { note: note.trim(), operationId: crypto.randomUUID() };
    }
    const request = incidentResolutionRequestSchema.parse({
      operationId: intent.current.operationId,
      expectedStatus: item.status,
      resolutionNotes: note,
    });
    await mutation.run(
      () =>
        api.request(
          `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/overview/incidents/${encodeURIComponent(item.incidentId)}/resolve`,
          incidentOverviewEntrySchema,
          { method: "POST", body: request },
        ),
      onResolved,
    );
  }
  return (
    <>
      {expanded ? (
        <div className={styles.field}>
          <label
            className={styles.fieldLabel}
            htmlFor="incident-resolution-note"
          >
            {ar ? "سبب المعالجة (مطلوب)" : "Resolution note (required)"}
          </label>
          <textarea
            autoFocus
            id="incident-resolution-note"
            className={styles.textarea}
            rows={3}
            maxLength={1000}
            required
            value={note}
            disabled={mutation.busy}
            aria-describedby="incident-note-privacy"
            onChange={(event) => setNote(event.target.value)}
          />
          <small id="incident-note-privacy">
            {ar
              ? "لا تُدخل أسرارًا أو بيانات شخصية غير ضرورية."
              : "Do not include secrets or unnecessary personal data."}
          </small>
          <button
            className={styles.primary}
            type="button"
            disabled={mutation.busy || !note.trim()}
            onClick={() => void resolve()}
          >
            {ar ? "تأكيد المعالجة" : "Confirm resolution"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.primary}
          onClick={() => setExpanded(true)}
        >
          {ar ? "تحديد كمحلولة" : "Mark Resolved"}
        </button>
      )}
      {mutation.error ? <p role="alert">{ar
        ? "تعذّر تأكيد المعالجة. أعد تحميل الحالة قبل إعادة المحاولة."
        : mutation.error}</p> : null}
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={api}
          onClose={mutation.closeMfa}
          onAssured={mutation.onMfaAssured}
        />
      ) : null}
    </>
  );
}
