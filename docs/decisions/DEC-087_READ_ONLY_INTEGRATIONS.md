# DEC-087 — Read-Only MVP Integrations

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

VAYLET has real server-controlled adapters for selected capabilities, while
tenant self-service provider configuration and POS/PMS/SSO are not implemented.

## Decision

The MVP Integrations page is read-only and shows only truthful, server-derived
status for actually implemented integrations. It must distinguish unavailable,
disabled, misconfigured/degraded, and operational states only where the system
can prove them without revealing secrets.

Company Admin cannot enter API keys, swap providers, self-enable providers, or
manage provider secrets. POS, PMS, and SSO remain out of scope. Tenant settings
such as OCR assist or notification-type enablement never imply that an external
provider is configured or production-safe.

## Reason

A truthful status surface is useful; tenant-controlled provider custody is a
separate security and operations product.

## Consequences

MGT-BE-12 owns bounded read projections only. No provider mutation endpoint,
secret persistence, or integration framework is authorized.

### 2026-10-15 Owner WA-D09/WA-D10 narrow amendment

Company administrators may configure the dedicated WhatsApp Guest Access
settings within Dashboard policies: company enable/disable, approved AR/EN
template selections, Location overrides and the company's own authorized
Meta business sending-number connection. This is a narrow exemption for
WhatsApp only. The existing Integrations page remains read-only for all
other providers. No Meta token or app secret may enter a browser. Connection
status must be verified by the authoritative backend; real activation remains
disabled until provider, consent and security gates pass.

## Security and privacy considerations

Status responses are allowlisted and redact credentials, identifiers,
endpoints, configuration payloads, and provider error details. Live provider
checks must be separately bounded and abuse-safe.

## Supersedes/amends references

Supersedes the old self-service integration direction; existing provider DECs
continue to govern their server-controlled adapters.

## Affected docs/code

`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`,
future integration-status adapters/contracts.
