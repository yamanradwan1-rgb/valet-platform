# WA-W6 — Scoped Dashboard WhatsApp settings and client freeze

Original worker-6 browser chat did not start. Prime authored the strictly W6-allowlisted Dashboard WhatsApp settings and transport tests in the existing isolated `feat/wa-w6-dashboard` worktree.

The only modified production client path is `apps/dashboard/src/features/administration/settings/settings-page.tsx`. All other client files introduced are new `whatsapp-*` Settings siblings. Native, Employee Web and Customer Web production code are unchanged; no shared UI, navigation, translations, copy or snapshots edited.

The Company Admin section reads and writes typed company defaults and exact selected Location overrides via authenticated Prime API routes. It shows server-derived Meta sender verification, AR/EN, approved catalog versions and truthful disabled sending conditions, never accepts Meta secrets, and never calls a send endpoint. Management must reauthorize active ORG_ADMIN, target Organization/Location and sensitive MFA at the server before writing. Binding metadata remains per company; original WhatsApp policy is default OFF.

Evidence: Dashboard TypeScript PASS; three targeted settings transport/schema tests PASS. Physical Native parity in EN/AR, offline/background, saved/no-phone/condition and real Meta testing remain unrun/gated. Full UI freeze is checked separately by W7 guard against the original 2174-file manifest.
