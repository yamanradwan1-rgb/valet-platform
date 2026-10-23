# VAYLET Issue #321 — four Policies & Settings React prototypes

Phase A only. Owner selection of a design is required before any production implementation. These four interactive React + TypeScript previews share the **actual current Dashboard shell**, not a separately styled replica.

## Launch and compare

From the repository root:

```powershell
pnpm install --dir prototypes/issue-321 --frozen-lockfile
pnpm --dir prototypes/issue-321 dev
```

Open `http://127.0.0.1:3321/a`, `/b`, `/c`, or `/d`. The compare switcher above the secondary navigation changes variants in the same session. To select a section directly, append `?section=company`, `?section=location`, `?section=presence`, `?section=services`, or `?section=overview`.

The preview also supports `scenario=company-with-location`, `company-no-location`, `location-manager`, and `denied`, together with `lang=en|ar` and `theme=light|dark`. For example:

```text
http://127.0.0.1:3321/c?section=location&scenario=location-manager&lang=ar&theme=dark
```

Use the actual Dashboard header controls for theme, language, and scope. Use the browser's Back, Forward, and Refresh to check URL state. Try Help (including Escape/focus return), individual setting drafts/Save, unsaved-navigation confirmation, Inherit company, role simulation, Shift Presence scope, and the clearly labeled revision-conflict simulation.

Run checks with:

```powershell
pnpm --dir prototypes/issue-321 typecheck
pnpm --dir prototypes/issue-321 build
```

The `Save` and `Sign out` controls are **prototype-only simulations**. No backend authorization, actual persistence, messaging, or external service configuration is performed. All organization, location, and settings values are synthetic; they do not describe a real tenant.

## Four options

| Option | Implementation | Navigation approach | Primary tradeoff |
| --- | --- | --- | --- |
| A — Classic Focused | `variants/option-a/` | Quiet, traditional vertical section rail | Safest layout extension; fewer advanced group cues |
| B — Grouped Enterprise | `variants/option-b/` | Expandable Company, Location and Information groups | Scales to more settings; slightly busier on narrow screens |
| C — Context First | `variants/option-c/` | Scope chain above a descriptive section sidebar | Clear Company→Location inheritance; uses more vertical space |
| D — Compact Workspace | `variants/option-d/` | Dense, understated vertical navigation | Most efficient desktop use; fewer explanatory hints |

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
- The Operating Hours card and WhatsApp panel deliberately demonstrate current placement/concepts without imitating their full secured production editors. Status and presence readiness cannot be truthfully populated without an authorized backend read. Saved fixture values are not server-effective values.
- Production authentication/MFA, server validation, grants, optimistic concurrency, provider statuses, live attendance zone maps and messaging delivery require Phase B wiring after Owner approval. This Phase A is a design-selection aid.

To keep comparisons meaningful, leave original production shell CSS, theme definitions, sidebar, topbar, and navigation untouched during this phase.
