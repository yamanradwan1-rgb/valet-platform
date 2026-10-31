export function whatsappRevisionChanged(
  editorRevision: number | null,
  serverRevision: number | null,
): boolean {
  return (
    editorRevision !== null &&
    serverRevision !== null &&
    editorRevision !== serverRevision
  );
}

export function whatsappRevisionMessage(locale: "ar" | "en"): string {
  return locale === "ar"
    ? "تغيّرت سياسة واتساب على الخادم. أغلق المحرّر وراجع القيم الجديدة قبل الحفظ."
    : "WhatsApp policy changed on the server. Close this editor and review the latest values before saving.";
}
