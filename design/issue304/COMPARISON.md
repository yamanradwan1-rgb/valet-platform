# VAYLET Issue #304 — four design directions

Every option shares the same frozen VAYLET shell, synthetic Location A/B resource records, and preview-only Key Slot / Parking Spot actions. Every option removes the **duplicate Operational Keys top-level tab in the design**, not in the product.

| | Option 1 — Unified Table | Option 2 — Overview + Tables | Option 3 — Master/Detail | Option 4 — Grouped Workspace |
| --- | --- | --- | --- | --- |
| Primary information architecture | One sortable/scannable family table, detail on selection | Compact status overview followed by both authoritative-looking resource tables | Select from list and inspect persistent contextual pane | Key state/usage groups and actual Parking Zone sections |
| Best operator scenario | Fast comparison across many rows | Shift lead reviewing availability of both families quickly | Detailed investigation of one resource, vehicle and custody | Finding a spot by actual zone or a key by current use |
| Density | Highest rows-per-screen | Moderate/high; limited summary space | Medium; inspector uses dedicated width | Moderate; collapse unneeded groups |
| Key custody | Drawer detail with illustrative events | Inspect via individual row/detail action | Most prominent illustrative custody timeline | Per-item detail within a group |
| Parking occupancy | Status / usage / vehicle columns | Summary and row occupancy | Detail panel and list badges | Per-zone occupied/available rows |
| Vehicle fallback | Row plate/descriptor and details | Row plate/descriptor, details | Selected record identity is prominent | Row/detail plate/descriptor |
| Narrow screens | Horizontal table region + usable details | Stacked summary/tables + row details | Sequential/mobile inspector | Collapsible group rows + details |
| Accessible inspection | Row/detail buttons, dialog focus and keyboard table actions | Plain section headings, paired resource tables, dialog actions | Clear list/inspector focus and mobile sequential detail | Group toggles expose expanded state, keyboard resource selection and modal focus cycle |
| Loading / empty / error | Local preview-state chooser within one family | Local preview-state chooser affecting summary and two tables | Local read-state selector alongside inspector | Local preview-state chooser across grouped resources |
| Strongest quality | Familiar data-table efficiency, high operational density | Simultaneous visibility of Key and Parking availability | Richest per-resource context without leaving workspace | Natural grouping using real Parking Zone concepts |
| Principal weakness | Column width/scan fatigue for very long values | Busy overview can displace detailed rows on narrow devices | Inspector occupies space that could show additional rows | Large zone sets may create excessive expanded content |
| Later implementation complexity (estimate only) | Relatively low to medium | Medium (aggregate projections must be validated/derived authoritatively) | Medium to high (selection/detail lifecycle) | Medium to high (stable zone grouping and paging) |
| Potential existing-API gap | Joined Key configuration and operational view, Key human label, detailed custody | Plus count projections; summary must not imply existing aggregate endpoint | Plus resource-level full detail / custody timeline | Grouped and paginated source/zone handling |
| Tradeoff | Dense wide tables require horizontal handling | Summary can consume valuable vertical space | Fewer resources visible at once | Many groups may require scrolling and expansion |

## Common invariants

ACTIVE configuration does not mean AVAILABLE. Unknown occupancy never appears as free. Inactive resources are not operationally assignable. Vehicle fallback is plate → truthful localized descriptor → unavailable. Key Slots never inherit fake Parking Zones. Parking Spot Zone may be missing for legacy rows. Creation and QR/print/download controls are unmistakably local, synthetic previews. Scope selection switches between fictional Locations and does not persist changes.

## Owner choice

This is a comparison, **not a decision**. No option is preselected; the Owner must approve a design explicitly before any product implementation starts.

For reproducibility and baseline limitations see README.md, evidence/shell-parity.md and evidence/interaction-qa.md. Final browser QA outcomes must be read from those reports, not inferred from this design comparison.

All four alternatives inherit the same *frozen-source* narrow mobile topbar problem observed in Edge (Sign out can wrap below the fixed 4rem header at 320/390px). That is **not an interior design differentiator** and is not resolved by selecting any one option. The Owner must explicitly accept the inherited limitation or separately authorize shell changes before a mobile release can pass full acceptance; this exploration itself made no shell changes.
