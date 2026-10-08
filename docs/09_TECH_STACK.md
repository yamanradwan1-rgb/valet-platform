# Locked Tech Stack

Status: Binding  
Version: 0.2

This document defines technologies the AI agent may not replace without an accepted decision.

## Repository

- Monorepo
- pnpm workspaces
- Turborepo
- TypeScript with strict mode

## Backend

- Node.js LTS
- NestJS
- REST API for MVP
- OpenAPI/Swagger documentation
- Zod for shared request/response/domain contract validation
- explicit domain services for state-machine behavior
- no external workflow/state-machine platform required

## Mobile application

### VAYLET Employee native app

- repository location: `apps/valet-native` as a sibling of `apps/valet`
- Expo SDK 57 generation with React Native 0.86
- Hermes enabled
- React Native New Architecture enabled
- Expo Router
- Expo Development Builds / real native binaries for native-capability proof;
  Expo Go is not production evidence
- Expo Continuous Native Generation; generated `android/` and `ios/`
  projects are not hand-maintained in Git without a later Accepted Decision
- Android-first delivery with minimum Android 10 / API 29 and compile/target
  API 36
- Android application/package ID: `com.vaylet.employee`
- iOS bundle ID: `com.vaylet.employee` from the same application architecture
- Expo Updates / OTA delivery disabled for the initial Android pilot;
  deterministic native binaries bundle their JavaScript

Employee Web remains operational through native development and the controlled
Android pilot. Native-primary cutover is evidence-gated, and Web retirement is
a separate later decision.

## Web applications

### Employee Web

- Next.js
- React
- App Router
- PWA-capable architecture
- mobile-first
- future offline support

### Customer App

- Next.js
- React
- mobile-first responsive web
- no login/password required in MVP
- session access by secure guest token

DEC-101 approves a **Guest-only Web Push** extension for
`GUEST_VEHICLE_READY`: standards browser Push API/Service Worker, reviewed
Node `web-push` library (v3.6.7 pinned in the T5 branch), VAPID
application-server authentication and a separate API modular-monolith worker
coordinated through durable PostgreSQL GuestPush registration/intent/delivery
tables. No new message broker, microservice, sticky session or third-party
notification state authority is introduced. Existing Guest Browser Session
cookie/CSRF and DEC-070 foreground READY flow remain authoritative. Supported
launch targets are Android Chrome, Android PWA and supported iOS/iPadOS 16.4+
**Home Screen** web apps; iPhone Safari tabs are foreground-only for this
contract. Approved code is not evidence of runtime or physical notification
delivery.

### Management Dashboard

- Next.js
- React
- desktop/tablet-first responsive UI

## Database

- PostgreSQL
- Prisma ORM
- Prisma migrations
- database constraints remain authoritative for critical integrity

Do not use MongoDB for the operational core.

## Object storage

S3-compatible private object storage.

Development may use a compatible local provider later if required.

Production candidates may include AWS S3, Cloudflare R2 or another S3-compatible service, but provider selection is not part of the domain.

## Authentication

Staff:

- email/password for MVP
- Argon2id password hashing
- short-lived access token
- refresh-token rotation/revocation

Customer:

- unguessable scoped guest token
- OTP only for secure handoff, not as a general account system

## Notifications

Application-level notification abstraction.

External guest/contact channels:

- SMS
- future WhatsApp adapter

Employee Native push:

- provider-neutral registration, intent, delivery and result concepts
- direct FCM HTTP v1 adapter for the initial Android implementation
- Expo Notifications native-device-token and client lifecycle boundary; Expo
  Push Service is not selected
- later direct APNs adapter compatibility without changing shared domain
  concepts
- best-effort attention only; canonical API polling/refetch remains truth

For local development:

- mock/logging provider

Commercial SMS/WhatsApp provider selection is TBD.

## Payments

Payment abstraction exists in the domain/application layer.

Earliest pilot may run with payment disabled.

Commercial payment provider is TBD.

No raw card data enters our application.

## API style

REST for MVP.

Do not introduce GraphQL unless explicitly approved.

Use explicit command endpoints for state-changing workflow operations.

## Testing

- unit tests for domain/state machine
- integration tests for database constraints and transactions
- API/e2e tests for critical workflow/security paths
- frontend tests only where they protect important behavior

Preferred test runner: Vitest where practical.

## Infrastructure

Local:

- Docker Compose for PostgreSQL
- applications run through normal pnpm development commands

Initial production:

- containerized applications
- reverse proxy/load balancer as appropriate
- managed/object storage
- single-region deployment is sufficient for pilot

Not MVP:

- Kubernetes
- service mesh
- Kafka
- distributed event buses
- multi-region active/active

## Version policy

Framework/tool names are locked by this document.

Exact package versions should be selected from mutually compatible stable releases during bootstrap and then pinned in `pnpm-lock.yaml`.

After lockfile creation, dependency upgrades must be intentional rather than silently replacing the chosen architecture.
