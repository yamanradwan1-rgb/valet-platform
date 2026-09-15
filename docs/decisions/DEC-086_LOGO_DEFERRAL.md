# DEC-086 — Logo Customization Deferred

Status: Accepted
Date: 2026-09-15
Owner: VAYLET product owner

## Context

DEC-062 deferred logos because no server-controlled verified asset boundary
exists. Current VehiclePhoto metadata is not verified logo evidence.

## Decision

Logo customization is deferred and is not a current Management implementation
task unless later repository evidence proves it is a launch blocker. A future
contract must use server-controlled upload, byte/type/size validation, private
verified storage, authorization, lifecycle, and safe delivery. Arbitrary client
logo URLs and reuse of client-declared VehiclePhoto object keys are forbidden.

## Reason

Display name and color provide the current branding need without creating an
unsafe asset trust boundary.

## Consequences

The old logo packet is deferred. DEC-062 remains unchanged.

## Security and privacy considerations

No client URL, object key, MIME declaration, or existing photo row is trusted
as a logo. A future path requires server verification and private authorization
from upload through delivery and deletion.

## Supersedes/amends references

Confirms DEC-062's logo deferral and supersedes the old active logo packet.

## Affected docs/code

`docs/08_DECISIONS_LOG.md`, `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md`.
