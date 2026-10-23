# VAYLET Issue #321 — four Policies & Settings React prototypes

Phase A only. Owner selection of a design is required before any production implementation. These four interactive React + TypeScript previews share the **actual current Dashboard shell**, not a separately styled replica.

## Launch and compare

From the repository root:

```powershell
pnpm install --dir prototypes/issue-321 --frozen-lockfile
pnpm --dir prototypes/issue-321 dev
```

Open `http://127.0.0.1:3321/a`, `/b`, `/c`, or `/d`. The compare switcher above the secondary navigation changes variants in the same session. To select a section directly, append `?section=company`, `?section=location`, `?section=presence`, `?section=services`, or `?section=overview`.

The preview also supports `scenario=company-with-location`, `company-no-location`, `location-manager`, `location-manager-read-only`, and `denied`, together with `lang=en|ar` and `theme=light|dark`. Forbidden deep-linked sections are normalized to an allowed section in the address bar. For example:

```text
http://127.0.0.1:3321/c?section=location&scenario=location-manager&lang=ar&theme=dark
```

Use the actual Dashboard header controls for theme, language, and scope. Use the browser's Back, Forward, and Refresh to check URL state. Try Help (including Escape/focus return), individual setting drafts/Save/Clear Override, unsaved-navigation confirmation, Company/Location inheritance, role/capability simulation and revision-conflict examples.

For the formerly missing Shift Presence flow, open `/b?section=presence&scenario=company-with-location`, then:

1. **Overview & map** shows the saved demonstration zones and the distinction between local samples and server readiness.
2. **Attendance zones → Add zone** opens an interactive map and form. Click a map point, manually edit latitude/longitude, set a 5–1000 m radius, or press **Use My Current Location** (one foreground browser permission request). Enter label/code/state and save the zone *to the current prototype session*; then try Edit, Enable and Disable.
3. **Start / end policy** offers the four real independently saved fields and the distinction between Company defaults and exact Location overrides. Strict modes require explicit confirmation in the simulation.
4. **Exceptions** starts with honest empty Pending/History lists. Choose **Load a fictional request** to examine the review dialog, explicit simulated approval/rejection confirmation, and role-restricted Details mode. Every request and action is visibly synthetic, requires no backend/MFA, and never changes a real shift.
5. **Guided setup** has Scope, Zones, Policy and Review, consistent with the actual production step structure.

The default self-contained preview uses a clickable offline coordinate-grid schematic, clearly marked as illustrative. To test the **actual Google geographic map**, supply the optional `VITE_GOOGLE_MAPS_API_KEY` to the Vite process from a key authorized for local preview; the component reuses the Dashboard's production Google Maps loader and a real marker/circle. Google map requests can process a viewed center, including a user-proposed position. Neither map mode calls a VAYLET API or performs continuous tracking. Without a valid Maps key, geographic tiles are **not** claimed as visually verified.

Other complete content surfaces include all 15 Company/CA Location typed ordinary settings (10 authorized LM keys), the seven-day OPEN/CLOSED schedule with real HH:mm times and Company inheritance, Location-only SLA Save/Clear validation, the current four-field WhatsApp policy editor in its existing CA Company/Location placement, and read-only Service Status search/filter/refresh.

### Option D — Owner's provisional selection and final polish

The Owner provisionally selected **D** for further design work on 23 October. Only D now omits **Service Status** entirely: it is absent from its sidebar and direct `/d?section=services` URLs normalize to an allowed editing section. A/B/C remain preserved for comparison and retain their original Service Status demonstration.

D now uses icon-led sidebar group labels and four meaningful editor groupings — Arrival & handoff, Location & tracking, Fees & payment, and Language & notifications — without changing the 15 original fields or their permissions. The redundant second section heading has been removed. At mobile widths the vertical secondary navigation is an accessible disclosure, with Enter/Space to open, Escape to close, and focus management after choosing a section. The global Dashboard shell remains exactly the same.

Review the post-selection captures and QA notes in [`evidence/option-d-polish/`](evidence/option-d-polish/REVIEW.md). This is still Phase A, pending the Owner's final visual acceptance for Phase B.

Run checks with:

```powershell
pnpm --dir prototypes/issue-321 typecheck
pnpm --dir prototypes/issue-321 build
```

The `Save` and `Sign out` controls are **prototype-only simulations**. No backend authorization, actual server persistence, messaging, or external service configuration is performed. All organization, location, and settings values are synthetic; they do not describe a real tenant. Saved samples are retained only in the running React preview session; browser Refresh rebuilds the fixtures.

## Four options

| Option | Implementation | Navigation approach | Primary tradeoff |
| --- | --- | --- | --- |
| A — Classic Focused | `variants/option-a/` | Quiet, traditional vertical section rail | Safest layout extension; fewer advanced group cues |
| B — Grouped Enterprise | `variants/option-b/` | Expandable Company, Location and Information groups | Scales to more settings; slightly busier on narrow screens |
| C — Context First | `variants/option-c/` | Scope chain above a descriptive section sidebar | Clear Company→Location inheritance; uses more vertical space |
| D — Compact Workspace | `variants/option-d/` | Icon-led grouped navigation, compact editors and mobile disclosure; Service Status omitted | Efficient section access; deliberate compact density |

Exactly one selected settings pane is displayed in each option. Secondary navigation exists only inside the Policies & Settings content area, while the global Dashboard sidebar/topbar remain shared and unmodified.

## Immutable source provenance

Baseline main SHA: `20998a069eb5d576895c0e6c149271a4a0e4028b`.

- Shell: imported directly from `apps/dashboard/src/components/shell/dashboard-shell.tsx` and its actual Sidebar, Topbar, navigation list and mobile dialog.
- Navigation: `apps/dashboard/src/lib/navigation/dashboard-navigation.ts`, filtered for the synthetic test role/scope.
- Theme: `apps/dashboard/src/lib/theme/{theme-provider,theme}.tsx/ts`.
- Styles and fonts: production `apps/dashboard/src/app/globals.css` and its imports, without modification.
- Branding assets: copies of unchanged source `apps/dashboard/public/vaylet-*.png` inside `public/` for the standalone Vite origin.
- Next.js Link/Image: minimal **preview-only** Vite adapters in `shared/shell/`; the shell itself comes from the real Dashboard.
- Existing setting definitions and Help: source inventory in `shared/fixtures/INVENTORY.md`, and direct imports of production Help copy in `shared/components/HelpDialog.tsx`.

All variant and shared-component styles are scoped to prototype classes. The only production-source references are read/build imports. Nothing in `apps/dashboard/`, APIs, Prisma, database, migrations, or production `/policies` routing is changed.

## Evidence and known constraints

- `evidence/baseline/`: authenticated test-shell screenshots at four viewport widths, EN/AR, light/dark, plus 160% and 200% zoom cases and measured DOM geometry. Test account and operational labels are synthetic. The test uses intercepted staff context and makes no production mutations.
- `evidence/qa/`: normalized A/B/C/D screenshot matrix, dimensions, interaction results, zoom and accessibility review. Read the QA report for precise pass/fail/blocked classifications.
- Preview parity is about the shared **global shell**, not identical Policies content: the four alternative secondary-navigation arrangements are the purpose of this issue.
- Source-identical shell components and matched DOM geometry establish strong design fidelity, but pixel-exact **1440px logo** comparison remains blocked: the original W1 baseline screenshots were captured before the Next image completed loading, and the isolated original Next server could not be safely restarted because of a local module-resolution failure. The preview correctly loads the original VAYLET logo assets. Do not mistake a blank reference logo for the intended design.
- The 160%/200% zoom captures establish no **new** overflow relative to the current Dashboard baseline, but inherited global shell overflow at extreme effective widths is visible in both. These snapshots alone cannot establish WCAG reflow conformance or a passing 200% usability gate; treat that as an existing shell constraint requiring separate product authorization.
- The prototypes represent the existing settings editors/sections but continue to simulate server authorization, MFA, revisions and mutations. Service Status and presence readiness cannot be truthfully populated without an authorized backend read, and fixture values are not server-effective values. Fictional presence exception requests can be explicitly loaded for a dialog/review demonstration; the lists start empty and the simulated approval never starts or ends a shift.
- Production authentication/MFA, server validation, grants, canonical optimistic concurrency and messaging delivery require Phase B wiring after Owner approval. The separate optional Google preview demonstrates actual geographic tiles, while the default offline map supports full zone-draft interactions without map-service credentials.

To keep comparisons meaningful, leave original production shell CSS, theme definitions, sidebar, topbar, and navigation untouched during this phase.
