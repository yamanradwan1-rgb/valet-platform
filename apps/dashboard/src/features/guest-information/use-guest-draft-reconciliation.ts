"use client";

import { useEffect } from "react";
import type {
  GuestDraftValues,
  NestedMfaDraftMemory,
} from "../../components/foundation/nested-mfa-draft-memory";
import { translate } from "./approved-elements";
import type {
  ContactDefaults,
  GuestLanguage,
  LocationContact,
  LocationPrivacy,
} from "./guest-information-model";

// The exact confirmation already used for a server 409 during normal Save.
export function confirmGuestInformationConflict(
  locale: GuestLanguage,
): boolean {
  return window.confirm(
    translate(
      locale,
      "These settings changed elsewhere. Press OK to keep your edits for review, " +
        "or Cancel to discard them and load the latest saved values.",
      "تغيّرت هذه الإعدادات في جلسة أخرى. اضغط موافق للاحتفاظ بتعديلاتك " +
        "للمراجعة، أو إلغاء لتجاهلها وتحميل آخر نسخة محفوظة.",
    ),
  );
}

export function guestInformationConflictNotice(
  locale: GuestLanguage,
  keep: boolean,
): string {
  return translate(
    locale,
    keep
      ? "Latest settings are loading. Review your edits before saving again."
      : "Latest saved settings are loading.",
    keep
      ? "جارٍ تحميل آخر نسخة. راجع تعديلاتك قبل إعادة الحفظ."
      : "جارٍ تحميل آخر إعدادات محفوظة.",
  );
}

export function useGuestDraftReconciliation(input: {
  readonly memory: NestedMfaDraftMemory | null | undefined;
  readonly ready: boolean;
  readonly locale: GuestLanguage;
  readonly privacy: LocationPrivacy | null;
  readonly contact: LocationContact | null;
  readonly company: ContactDefaults | null;
  readonly onDecision: (keep: boolean) => void;
}): boolean {
  const { memory, ready, locale, privacy, contact, company, onDecision } =
    input;
  const versions = {
    privacy: privacy?.revision,
    contact: contact?.revision,
    company: company?.revision,
  };
  const blocked = ready && Boolean(memory?.conflicts(versions).length);

  useEffect(() => {
    if (!memory?.restoring || !ready || !privacy || !contact) return;
    const values: GuestDraftValues = {
      "privacy:drafts": privacy.drafts,
      "contact:fields": contact.fields,
      "contact:hours": contact.hoursConfirmed,
      "company:values": company,
    };
    const current = {
      privacy: privacy.revision,
      contact: contact.revision,
      company: company?.revision,
    };
    for (const resource of memory.conflicts(current)) {
      const keep = confirmGuestInformationConflict(locale);
      memory.reconcile(resource, current[resource]!, values, keep);
      onDecision(keep);
    }
  }, [company, contact, locale, memory, onDecision, privacy, ready]);

  useEffect(() => {
    if (!memory?.restoring || !ready || blocked) return;
    const frame = requestAnimationFrame(() => memory.finishRestoration());
    return () => cancelAnimationFrame(frame);
  }, [blocked, memory, ready]);

  return blocked;
}
