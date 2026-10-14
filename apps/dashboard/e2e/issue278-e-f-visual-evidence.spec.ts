import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { locationIntelligenceReply } from "./support/md05-intelligence-fixtures";
import { operationsReadReply } from "./support/operations-fixtures";
import { md04AuditReply } from "./support/md04-audit-fixtures";
import { md04FeatureAuthority, visitSearchPath, visitSearchReply } from "./support/md04-fixtures";
import { contextHelpRegistry } from "../src/features/help/context-help-registry";
import { helpRouteManifest } from "../src/features/help/help-route-manifest";

const evidenceDir = process.env.ISSUE278_EVIDENCE_DIR;
const phase = process.env.ISSUE278_EVIDENCE_PHASE ?? "after";
const routes = [
  ["/", "workspace", "CA"],
  ["/overview", "overview", "LM"],
  ["/live-operations", "live", "LM"],
  ["/vehicles", "vehicles", "LM"],
  ["/tasks", "tasks", "LM"],
  ["/maps-zones", "maps", "LM"],
  ["/keys", "keys", "LM"],
  ["/incidents", "incidents", "LM"],
  ["/employees", "employees", "CA"],
  ["/locations", "locations", "CA"],
  ["/policies", "policies", "CA"],
  ["/roles-permissions", "roles", "CA"],
  ["/branding", "branding", "CA"],
  ["/billing-subscription", "billing", "CA"],
  ["/payments", "payments", "LM"],
  ["/analytics", "analytics", "LM"],
  ["/reports", "reports", "LM"],
  ["/audit-log", "audit", "CA"],
  ["/customers", "contacts", "CA"],
  ["/security", "security", "ACCOUNT"],
  ["/help", "help", "CA"],
  ["/staff/activate", "activation", "PREAUTH"],
] as const;
const variants = [
  { name: "1440-en-light", width: 1440, height: 900, locale: "en", theme: "Light" },
  { name: "390-ar-dark", width: 390, height: 820, locale: "ar", theme: "Dark" },
  { name: "320-en-dark", width: 320, height: 760, locale: "en", theme: "Dark" },
  { name: "768-ar-light", width: 768, height: 900, locale: "ar", theme: "Light" },
  { name: "zoom200-css-768-ar-dark", width: 768, height: 900, locale: "ar", theme: "Dark", zoom: 2 },
] as const;
const deep = new Set(["audit", "contacts", "security", "help", "activation", "policies", "live", "analytics", "reports", "employees"]);

async function enter(page: Page, path: string, role: "CA" | "LM" | "ACCOUNT" | "PREAUTH") {
  if (role === "PREAUTH") {
    await page.goto(path);
    return;
  }
  const fixture = new DashboardApiFixture({
    companyOrganizations: role === "CA" ? [ORG_A] : [],
    companyLocations: role === "CA" ? { [ORG_A.organizationId]: [LOCATION_A] } : {},
    locationManagerOrganizations: role === "LM" ? [ORG_A] : [],
    locationManagerLocations: role === "LM" ? { [ORG_A.organizationId]: [LOCATION_A] } : {},
    mfaState: "ASSURED",
    override: (apiPath, request) => {
      if (apiPath === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (apiPath === visitSearchPath) return visitSearchReply(request, "CA");
      return md04AuditReply(apiPath, request, "CA") ??
        operationsReadReply(apiPath) ?? locationIntelligenceReply(apiPath, request);
    },
  });
  await fixture.install(page);
  await page.goto(path);
  if (role === "ACCOUNT") {
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    await page.getByLabel("Email").fill("admin@example.com");
    await page.getByLabel("Password").fill("fixture-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
    return;
  }
  await signInOnCurrentPage(page, role === "LM" ? "manager@example.com" : "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  if (path === "/customers" || path === "/billing-subscription") return;
  await page.getByRole("button", { name: role === "CA" && ["/audit-log", "/help", "/policies"].includes(path) ? "All Locations" : LOCATION_A.name }).click();
  if (path === "/") {
    // The ordinary authorized root redirects to Overview. Wait for that
    // actual destination before comparing screenshots from either worktree.
    await expect(page).toHaveURL(/\/overview$/u);
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  }
}

async function variantOf(page: Page, path: string, variant: typeof variants[number]) {
  await page.setViewportSize({ width: variant.width, height: variant.height });
  if (path === "/staff/activate") {
    if (await page.locator("html").getAttribute("lang") !== variant.locale) {
      await page.getByRole("button", { name: "EN / العربية" }).click();
    }
    if ((await page.locator("html").getAttribute("data-theme")) !== variant.theme.toLowerCase()) {
      await page.getByRole("button", { name: variant.theme === "Dark" ? "Dark / داكن" : "Light / فاتح" }).click();
    }
    if ("zoom" in variant) await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
    return;
  }
  if (await page.locator("html").getAttribute("lang") === "ar") {
    await page.getByRole("button", { name: "اللغة" }).click();
  }
  await page.getByRole("group", { name: "Theme" }).locator("button")
    .nth(variant.theme === "Light" ? 0 : 1).click();
  if (variant.locale === "ar") {
    await page.getByRole("button", { name: "Language" }).click();
  }
  if ("zoom" in variant) await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
}

async function evidence(page: Page, label: string, variant: typeof variants[number]) {
  const folder = join(evidenceDir!, phase);
  mkdirSync(folder, { recursive: true });
  const file = label + "-" + variant.name;
  const measure = await page.evaluate(() => {
    const bounds = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
    };
    const visibleBounds = (node: Element) => {
      const b = node.getBoundingClientRect();
      let r = { left: Math.max(0, b.left), top: Math.max(0, b.top),
        right: Math.min(innerWidth, b.right), bottom: Math.min(innerHeight, b.bottom) };
      for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor);
        if (!/(auto|scroll|hidden|clip)/u.test(css.overflow + css.overflowX + css.overflowY)) continue;
        const a = ancestor.getBoundingClientRect();
        r = { left: Math.max(r.left, a.left), top: Math.max(r.top, a.top),
          right: Math.min(r.right, a.right), bottom: Math.min(r.bottom, a.bottom) };
      }
      const style = getComputedStyle(node);
      if (!node.getClientRects().length || style.display === "none" || style.visibility === "hidden") return null;
      if (r.right <= r.left || r.bottom <= r.top) return null;
      return { x: +r.left.toFixed(2), y: +r.top.toFixed(2),
        w: +(r.right - r.left).toFixed(2), h: +(r.bottom - r.top).toFixed(2) };
    };
    const measure = (n: Element) => {
      const clipped = visibleBounds(n);
      const top = clipped ? document.elementFromPoint(clipped.x + clipped.w / 2, clipped.y + clipped.h / 2) : null;
      const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      const painted: DOMRect[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim() || node.parentElement?.closest("button")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        painted.push(...Array.from(range.getClientRects()));
      }
      const paintedTextRect = painted.length ? {
        x: +Math.min(...painted.map((item) => item.left)).toFixed(2),
        y: +Math.min(...painted.map((item) => item.top)).toFixed(2),
        w: +(Math.max(...painted.map((item) => item.right)) - Math.min(...painted.map((item) => item.left))).toFixed(2),
        h: +(Math.max(...painted.map((item) => item.bottom)) - Math.min(...painted.map((item) => item.top))).toFixed(2),
      } : null;
      return { text: ((n as HTMLElement).innerText ?? n.getAttribute("aria-label") ?? "").slice(0, 90),
        rect: bounds(n), visibleRect: visibleBounds(n),
        paintedTextRect,
        hitTarget: top === n || n.contains(top),
      };
    };
    const locate = (selector: string) => Array.from(document.querySelectorAll(selector)).slice(0, 35).map(measure);
    const firstHeading = document.querySelector("main h1");
    const pageHeader = firstHeading?.closest('[class*="header"]');
    const headerSubtitle = pageHeader?.querySelector('[class*="subtitle"]');
    return { semanticSchemaVersion: 2, path: location.pathname, locale: document.documentElement.lang, theme: document.documentElement.dataset.theme,
      cssZoom: document.documentElement.style.zoom || "100%",
      viewport: { w: window.innerWidth, h: window.innerHeight },
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      heading: locate("main h1, .auth-card h1"), sections: locate("main section h2, main section h3"),
      cards: locate("main section, main [class*='card']"), tables: locate("main table"),
      rows: locate("main table tbody tr"), tabs: locate("main [role='tablist']"),
      saves: locate("button[type='submit'], button[aria-label*='Save'], button[aria-label*='Clear']"),
      controls: locate('main button:not([aria-label^="Help:"]):not([aria-label^="مساعدة:"])'),
      scopeBadges: locate('main [class*="scopeBadge"]'),
      pageTitles: firstHeading ? [measure(firstHeading)] : [],
      pageSubtitles: headerSubtitle ? [measure(headerSubtitle)] : [],
      tableHeaders: locate("main th"),
      help: Array.from(document.querySelectorAll('button[aria-label^="Help:"],button[aria-label^="مساعدة:"]')).map((n) => ({
        label: n.getAttribute("aria-label"), rect: bounds(n),
        visibleRect: visibleBounds(n), hitTarget: measure(n).hitTarget,
        visible: (n as HTMLElement).getClientRects().length > 0,
      })),
    };
  });
  writeFileSync(join(folder, file + ".json"), JSON.stringify({ file, ...measure }, null, 2));
  await page.screenshot({ path: join(folder, file + ".png"), fullPage: true });
}

for (const [path, label, role] of routes) {
  test(`issue278 visual ${label} real route with synthetic data`, async ({ page }) => {
    test.skip(!evidenceDir, "Set ISSUE278_EVIDENCE_DIR for reproducible snapshots");
    await enter(page, path, role);
    if (phase === "after" && path !== "/") {
      const entry = helpRouteManifest[path];
      if (entry?.classification === "CONTENT") {
        await expect(page.getByRole("button", {
          name: "Help: " + contextHelpRegistry[entry.helpKey].en.title,
          exact: true,
        })).toBeVisible();
      }
    }
    const chosen = deep.has(label) ? variants : variants.slice(0, 2);
    for (const variant of chosen) {
      await variantOf(page, path, variant);
      await evidence(page, label, variant);
      // Reset to EN/light for the next deterministic variant.
      if (variant !== chosen.at(-1)) await page.reload();
    }
  });
}
