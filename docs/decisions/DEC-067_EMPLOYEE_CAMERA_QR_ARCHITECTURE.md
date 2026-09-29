# DEC-067 — Employee Camera & QR Capture Architecture

Status: Accepted
Date: 2026-08-25
Task: VUI-012 — Real Camera/QR Architecture

## Context

DEC-066 §5 deferred all real camera capture to VUI-012 and required this
focused decision before any `getUserMedia` call, `BarcodeDetector` dependency
or scanner library could enter the Employee app. Today every Live Employee
"scan" surface (parking spot confirm, verified key return, Check-In key
assignment, retrieval key checkout, handoff dynamic QR) renders only a static
`ScannerFrame` visual plus manual code entry, while prototype-mode files carry
fake simulate-scan buttons that must never reach Live mode.

The repository already provides everything the capture layer must compose into:
resource codes that never authorize (DEC-033), trim-only exact-match resource
evidence semantics (DEC-037/DEC-065), the raw `vhq1.` one-time Dynamic-QR proof
format whose raw material is ephemeral and never persisted (DEC-042), and the
Employee offline policy that forbids persistent queues or replay (DEC-063).
This decision locks the capture mechanism, payload formats, permission UX,
lifecycle obligations and abuse/security rules so camera support can be added
without weakening any of those boundaries.

Library compatibility evidence (verified against the npm registry at
decision time): `@zxing/browser@0.2.1` (latest) is the official ZXing
organization browser port. It ships ESM (`./esm/index.js`) and CJS builds with
TypeScript types, declares exactly one peer dependency
(`@zxing/library@^0.23.0`) and has **no React peer dependency**, so React 19.2
is unaffected. It is a plain browser-side TypeScript library consumed lazily
(`await import(...)`) from `"use client"` components only; it requires no
transpile setting, server runtime or SSR participation, which keeps it
compatible with Next.js 16's App Router client boundary. `BarcodeDetector`
was rejected as a mandatory mechanism because it remains unavailable in
several shipping browsers.

## Decision

### 1. Scanner mechanism and dependency

The Employee app uses `@zxing/browser` (with its `@zxing/library` peer) as the
sole QR decoding mechanism, invoked through a lazy dynamic import so it is
never evaluated during SSR and never loaded until an employee explicitly opens
a scanner. Decoding runs against a live `MediaStream` preview obtained through
`navigator.mediaDevices.getUserMedia` with rear-camera preference expressed as
`video.facingMode: { ideal: "environment" }`. No other scanner library,
computer-vision dependency, or native bridge is authorized. `BarcodeDetector`
may later be added ONLY as a documented optional optimization behind the same
interface where the platform exposes it, never as a requirement and never as a
second payload protocol.

No License Plate OCR is authorized under VUI-012. Camera capture in this
slice covers exactly: static resource QR codes (§4) and the Dynamic Handoff QR
(§5).

### 2. Camera permission UX states

Every camera surface presents distinct, truthful, localized (EN/AR) states:

```text
idle      — scanner closed; manual entry remains available
starting  — camera permission/stream being opened; no success claim
scanning  — live preview active
unsupported — navigator.mediaDevices missing or insecure context
denied    — permission denied; points at permissions and manual entry
busy      — camera held by another application/tab
no-device — no camera hardware found
error     — any other start failure; retry possible
```

A failed start never fabricates success, never fills an input, and always
leaves the manual fallback operable. The preview viewport is mobile-first and
every open scanner shows a large, clearly labeled Close control.

### 3. MediaStream lifecycle obligations (mandatory cleanup)

Camera streams are acquired only while their workflow step is actively
scanning. All tracks MUST be stopped — leaving no camera LED running and no
background capture — on each of:

1. explicit Close control;
2. a successfully accepted decode (camera stops immediately);
3. component unmount;
4. Employee Live route change away from the workflow;
5. workflow completion (success/cancel/back out of the capturing step);
6. authentication identity change while mounted.

Cleanup is belt-and-braces: the decoder's own stop handle is invoked AND every
track of the preview element's `MediaStream` is defensively stopped. Scanning
never continues invisibly after a decoded frame is accepted. No audio track is
ever requested.

### 4. Resource QR payloads (V1)

Static operational QR labels encode EXACTLY one of:

```text
vaylet:key-slot:<RESOURCE_CODE>
vaylet:parking-spot:<RESOURCE_CODE>
```

Payloads are typed, contain a single non-secret resource code, and are
NON-AUTHORITATIVE: a decoded code is display/evidence material only. Payloads
MUST NOT embed sessionId, taskId, membershipId, organization/location
identifiers, tokens, pickup secrets or any proof material. The parser accepts
only these exact prefixes; surrounding whitespace is trimmed per the accepted
server/manual semantics (trim only — never case-folded), the resource code is
preserved byte-exact, overlong (>120 chars), empty, URL, JSON or otherwise
unrecognized payloads are rejected without touching any input.

Decoding performs ZERO business mutation. The decoded code fills the
EXISTING manual input of the current step; the employee then performs the
existing explicit action (Continue → Confirm Parked with verified key return,
Assign Key, Verify Key Slot, Start Retrieval). Servers continue to re-prove
all authorization and evidence matching exactly as before; resource codes
never authorize anything and scan-first session discovery remains prohibited
(DEC-066 §5).

Key Slot capture exists only inside workflows that already hold authoritative
context and already offer manual `keySlotCode` entry: Check-In key assignment,
Parking verified key return (DEC-065 intact), and Retrieval key checkout.
There is NO generic top-level key lookup.

### 5. Dynamic Handoff QR — existing format reused exactly

Handoff capture scans the RAW existing `vhq1.<43 base64url>` payload and
validates against the EXISTING `DYNAMIC_QR_PATTERN`. The payload is never
wrapped, transformed, prefixed or re-encoded; no second handoff protocol is
introduced. A scanned payload fills the existing proof input; the employee
still presses the existing explicit Verify QR action which calls the existing
`verifyDynamicQr(sessionId, payload)`. Scanning NEVER marks a handoff verified
locally and never bypasses attempt/rate limits. Raw proof remains memory-only
transient input: cleared promptly after submission (success or failure)
exactly as manual entry already behaves, never written to storage, logs, URLs
or navigation state, with no scan history retained anywhere.

### 6. Duplicate-decode suppression

After a decode is ACCEPTED, the scanner stops and stays suppressed for that
capture session until the consumer deliberately re-arms it (for example
"Scan again"). This is a client obligation, not delegated to backend rate
limits: an accepted decode never repeats-submits a proof and never overwrites
an employee-edited input. Rejected payloads produce a truthful localized
message, never mutate inputs, and are deduplicated consecutively so a stationary
wrong label cannot spam the UI.

### 7. Manual fallback mandate

Every camera workflow MUST keep its manual entry path visible and operable
alongside the camera (including in every failure state). Camera capture is an
accelerator, never a gate.

### 8. Offline behavior

Capture composes with DEC-063 unchanged: a decoded value may fill a transient
current-screen draft input offline; protected mutations remain online-only;
no persistent queues, outboxes, replay or scan history exist. Connectivity
loss mid-capture only stops mutations, exactly as manual entry.

## Reason

Locking mechanism, payload grammar, lifecycle cleanup and suppression rules
before implementation prevents the classic failure modes of mobile QR capture
in operations tooling: cameras left running across navigation, repeated
submission of one frame, silent case-folding of evidence codes, a second
handoff protocol drifting from DEC-042, or scan UX quietly becoming an
authorization primitive. Reusing the existing manual-entry actions keeps the
trust boundary identical whether a code was typed or scanned.

## Consequences

- VUI-012 adds `@zxing/browser` + `@zxing/library` as the only new Employee
  dependencies, loaded lazily in client code only.
- All five capture surfaces share one parser, one scanner session controller
  and one camera UI component; each integration stays a thin adapter over
  existing inputs and actions.
- Prototype simulate buttons remain prototype-gated and untouched.
- Future barcode symbologies or plate OCR require a new focused decision.

## Affected docs/code

- `docs/decisions/DEC-067_EMPLOYEE_CAMERA_QR_ARCHITECTURE.md`
- `docs/08_DECISIONS_LOG.md` summary/index mirror
- `apps/valet/package.json`, `pnpm-lock.yaml` (scanner library only)
- `apps/valet/src/features/scanner/**`
- `apps/valet/src/components/scanner/**`
- shared Live flow steps: parking spot confirm / key return, Check-In key
  assignment, retrieval key checkout, handoff pending step
- `apps/valet/src/lib/i18n/dictionary-*-scanner.ts` fragments

## Later accepted amendment — DEC-096

DEC-096 adds explicit V2 static-resource payloads for newly generated
Management Key Slot and Parking Spot labels while preserving this decision's V1
grammar indefinitely. V2 preserves resource kind, immutable persisted UUID, and
exact code through the scanner boundary so authoritative operational
verification can reject a label from the wrong Location even when codes collide.
Camera lifecycle, no-mutation-on-scan, manual fallback, and QR-as-input-not-
authority requirements remain binding.
