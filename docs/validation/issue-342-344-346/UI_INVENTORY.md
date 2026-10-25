# Authorized UI changes and freeze review

## #344 — existing Attendance Zone form

`settings/shift-presence-zone-form.tsx` calls a diagnosis wrapper around the same
save API. Existing feedback renders either the localized last-zone explanation
or actionable generic readiness guidance. The same rejection code, alert area,
form fields, footer, focus behavior and dialog remain. There is no policy edit,
write retry, success feedback, zone mutation or dialog dismissal after rejection.

## #346 — existing Location lifecycle action area

`locations/location-lifecycle-panel.tsx` includes one contextual Resume component
alongside existing lifecycle actions. The action appears only for ACTIVE/closed
intake, under the existing Company Admin lifecycle surface. It reuses secondary
and primary button classes, FocusDialog, dialog title, stack, footer, feedback,
loading, disabled state and sensitive MFA components. The confirmation names the
Location and states that existing shifts/work continue. It requires explicit
confirmation and refreshes authoritative data on success/conflict. New feedback
is localized; old-selection callbacks are fenced by the existing mutation guard.
The new attributed audit event has an EN/AR label in the existing audit catalog.
No audit page, filter or layout changes.

## #342 — existing Shift Details drawer

`staff/staff-shift-drawer.tsx` adds a subordinate read-only Cash Reconciliation
section after the existing duration fact and before the existing actions/help.
The section uses existing stack, section-title, muted and strong classes. Six
fact rows show expected, declared, signed variance, currency, Location-local report
time and safe reporting identity. A note distinguishes declaration from physical
management receipt/deposit/settlement. Missing evidence never becomes zero.
There are no controls, tabs, standalone drawers or financial calculations.

## Preserved surfaces

- Sidebar, topbar, navigation, menus and page headers.
- Existing cards, tables, filters, search and pagination.
- Drawer/confirmation component geometry and responsive breakpoints.
- Fonts, typography, colors, spacing, borders, shadows, icons and design tokens.
- Light/Dark themes, RTL/LTR and Contextual Help.
- Native Employee and Customer surfaces.

No stylesheet, global CSS, theme, shell, navigation or design-system file changes.
Only existing styles are referenced. Added content can increase internal scroll
length; existing drawer widths and layout rules are retained.

## Evidence method

The same synthetic API fixtures render the base SHA and the feature checkout in
separate local Next servers. The matrix covers EN/AR, Light/Dark, 320/390/768/1440
pixels and CSS zoom 100%/200%. It compares sidebar/topbar/header/tab geometry and
computed style, captures before/after screenshots for each affected surface, and
checks confirmation keyboard containment and Cash section labels. Scroll origins
are normalized because native focus scrolling responds to the approved added
content height. Native browser zoom and a real assistive-technology user session
are not simulated by these checks.

Representative affected-area screenshots accompany RESULTS.md. The complete
matrix captures are local verification artifacts, not application assets.
