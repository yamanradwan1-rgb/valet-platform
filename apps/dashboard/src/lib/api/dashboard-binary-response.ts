import { dashboardMalformedError } from "./dashboard-api-error";

export function parseDashboardBinaryHeaders(
  headers: Headers,
  expectedContentType: string,
): { readonly contentType: string; readonly filename: string } {
  const contentType = headers.get("content-type");
  if (contentType !== expectedContentType) throw dashboardMalformedError();
  // Protected photo bytes are rendered in memory, never downloaded as an attachment.
  if (expectedContentType === "image/jpeg") {
    return { contentType, filename: "" };
  }
  const disposition = headers.get("content-disposition");
  if (disposition === null) throw dashboardMalformedError();
  const match = /^attachment; filename="([A-Za-z0-9][A-Za-z0-9._-]*)"$/.exec(
    disposition,
  );
  const filename = match?.[1];
  if (!filename) throw dashboardMalformedError();
  const extension = expectedContentType === "application/pdf" ? ".pdf" : ".csv";
  if (!filename.endsWith(extension)) throw dashboardMalformedError();
  return { contentType, filename };
}
