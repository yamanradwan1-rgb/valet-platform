import { expect, test } from "@playwright/test";

// CONDITIONAL future G3 ONLY. Requires a Prime-owned authenticated browser,
// an actual-writer-created Session and source event. No route mocks are used.
const baseURL = process.env.ISSUE300_ACCEPTANCE_BASE_URL;
const storageState = process.env.ISSUE300_ACCEPTANCE_STORAGE_STATE;
const locationPath = process.env.ISSUE300_ACCEPTANCE_LOCATION_AUDIT_PATH;
const sessionId = process.env.ISSUE300_ACCEPTANCE_SESSION_ID;
const sourceId = process.env.ISSUE300_ACCEPTANCE_EVENT_ID;
const sourceKind = process.env.ISSUE300_ACCEPTANCE_EVENT_SOURCE;
const occurredAt = process.env.ISSUE300_ACCEPTANCE_EVENT_OCCURRED_AT;
const windowFrom = process.env.ISSUE300_ACCEPTANCE_WINDOW_FROM;
const windowTo = process.env.ISSUE300_ACCEPTANCE_WINDOW_TO;
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const configured = Boolean(baseURL && storageState && locationPath &&
  uuid.test(sessionId ?? "") && uuid.test(sourceId ?? "") &&
  ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"].includes(sourceKind ?? "") &&
  occurredAt && Number.isFinite(Date.parse(occurredAt)) &&
  windowFrom && windowTo && Date.parse(windowFrom) < Date.parse(windowTo));

test.skip(!configured,
  "GAP: requires G2 verified real-writer source IDs, browser lease, scoped CA/LM auth");
if (baseURL && storageState) test.use({ baseURL, storageState });

test("T36/T56/T59/T70 real source identity survives search, timeline and point detail", async ({ page }) => {
  const wire: Array<{ path: string; data: unknown }> = [];
  page.on("response", (response) => {
    if (!response.ok() || !new URL(response.url()).pathname.includes("/audit-investigations/")) {
      return;
    }
    void response.json().then((data: unknown) => {
      wire.push({ path: new URL(response.url()).pathname, data });
    }).catch(() => {});
  });
  await page.goto(locationPath!);
  const investigation = page.getByRole("tab", { name: /Investigation Search|بحث التحقيق/ });
  await investigation.click();
  await expect(page.getByText(/LIVE DATA|بيانات فعلية/)).toBeVisible();
  await expect(page.getByText(/DEMO DATA|بيانات تجريبية/)).toHaveCount(0);
  const zone = "Asia/Amman";
  function parts(instant: string) {
    const entries = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const value = (kind: string) => entries.find((part) => part.type === kind)?.value ?? "";
    return { date: `${value("year")}-${value("month")}-${value("day")}`,
      time: `${value("hour")}:${value("minute")}` };
  }
  const from = parts(windowFrom!);
  const to = parts(windowTo!);
  expect(from.date).toBe(to.date);
  await page.locator('input[type="date"]').fill(from.date);
  const times = page.locator('input[type="time"]');
  await times.nth(0).fill(from.time);
  await times.nth(1).fill(to.time);
  const exactSession = page.getByLabel(/Exact Session ID|معرّف الجلسة/);
  await exactSession.fill(sessionId!);
  await page.getByRole("button", { name: /Apply search|تطبيق البحث/ }).click();
  await expect.poll(() => wire.some(({ path }) => path.endsWith("/sessions"))).toBe(true);
  const search = wire.find(({ path }) => path.endsWith("/sessions"))?.data as
    { items?: Array<{ sessionId: string }> } | undefined;
  expect(search?.items?.some((item) => item.sessionId === sessionId)).toBe(true);
  await expect.poll(() => wire.some(({ path }) => path.endsWith("/timeline"))).toBe(true);
  const timeline = wire.find(({ path }) => path.endsWith("/timeline"))?.data as
    { items?: Array<{ key: { source: string; eventId: string }; occurredAt: string }> } | undefined;
  const source = timeline?.items?.find((item) =>
    item.key.source === sourceKind && item.key.eventId === sourceId);
  expect(source?.occurredAt, "Persisted event UTC time must match the writer record").toBeTruthy();
  expect(Date.parse(source!.occurredAt)).toBe(Date.parse(occurredAt!));
  await page.getByRole("button", { name: new RegExp(sourceId!, "i") }).click();
  await expect.poll(() => wire.some(({ path }) => path.endsWith(
    "/events/" + sourceKind + "/" + sourceId))).toBe(true);
  const detail = wire.find(({ path }) => path.endsWith(
    "/events/" + sourceKind + "/" + sourceId))?.data as
    { sessionId?: string; source?: string; occurredAt?: string } | undefined;
  expect(detail).toMatchObject({ sessionId, source: sourceKind });
  expect(Date.parse(detail!.occurredAt!)).toBe(Date.parse(occurredAt!));
  await expect(page.getByRole("dialog")).toContainText(sourceId!);
  await expect(page.getByRole("dialog")).not.toContainText(/VS-DEMO-|INC-304|CUS-102/);
});
