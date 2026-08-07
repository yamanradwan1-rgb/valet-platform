# Locked Tech Stack

Status: Binding  
Version: 0.1

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

## Web applications

### Valet Employee App

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

Initial channels:

- SMS
- future WhatsApp adapter

For local development:

- mock/logging provider

Commercial provider selection is TBD.

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
