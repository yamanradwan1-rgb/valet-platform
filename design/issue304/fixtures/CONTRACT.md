# Issue #304 design fixture and truth contract

The canonical-data.json file is the ONLY demo data. All names, dates, identifiers, plate strings, employee labels, locations, zones and timestamps are explicitly SYNTHETIC. Do not query VAYLET APIs or persist state. Any preview action must say it is not saved.

- Real current KeySlotConfiguration list renders code and ACTIVE/INACTIVE, while the separate KeySlotOverviewEntry operational list renders availability/holding vehicle. The combined unified view is PROPOSED and does not imply a single existing API already returns every field.
- Current ParkingSpotListEntry shows code, label, zone, status and optional occupancy and vehicle. A Key Slot human-friendly label in the design is a PROPOSED field.
- Custody events, actor labels and timestamps in this fixture are illustrative details; do not claim the existing Key Slot endpoint supplies this history. No custody mutation is permitted.
- Configuration status and usage/occupancy are independent. ACTIVE is not proof of availability; INACTIVE and UNKNOWN must never appear confirmed available. Null Zone means legacy/unassigned and is valid only for Parking Spots.
- For vehicle identity, show normalized plate, else localized temporary descriptor, else localized unavailable; never show UUID as primary vehicle label.
- Existing Add Key Slot, Add Parking Spot, Add Parking Zone, QR label view/print/download controls may be PREVIEWED but not executed or saved.

Sources inspected: apps/dashboard/src/features/operations/keys/keys-page.tsx, keys-operational-view.tsx, key-presentation.ts, apps/dashboard/src/features/administration/physical-resources/physical-resources-panel.tsx, physical-resource-table.tsx, physical-resources-copy.ts. All four concepts must use precisely these same demo resources across both fake Locations.
