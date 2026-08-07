# Database Schema — Logical Design

Status: Binding  
Version: 0.1

Database: PostgreSQL  
ORM: Prisma

Use UUID/UUIDv7-style non-sequential identifiers consistently.

## organizations

```text
id
name
status
timezone
created_at
updated_at
```

Constraints:

- name required
- controlled status
- timezone required
- DB timestamps stored in UTC

## locations

```text
id
organization_id
name
code
address_text
status
created_at
updated_at
```

Constraints:

- FK -> organization
- unique `(organization_id, code)`

## users

```text
id
email
phone
password_hash
status
created_at
updated_at
last_login_at
```

Constraints:

- normalized email unique when present
- password hash never exposed

## organization_memberships

```text
id
organization_id
user_id
role
status
created_at
updated_at
```

Constraints:

- unique `(organization_id, user_id)`
- role:
  - ORG_ADMIN
  - LOCATION_MANAGER
  - VALET_EMPLOYEE

## membership_location_access

```text
membership_id
location_id
created_at
```

Constraints:

- unique `(membership_id, location_id)`
- both sides must belong to same Organization

## shifts

```text
id
organization_id
location_id
membership_id
status
started_at
ended_at
created_at
```

Status:

- ACTIVE
- ENDED

Constraints:

- ended_at >= started_at
- one active shift per membership unless later explicitly changed

## customers

```text
id
organization_id
phone_normalized
display_name
created_at
updated_at
```

Keep customer data minimal.

## vehicles

```text
id
organization_id
plate_country
plate_number_raw
plate_number_normalized
make
model
color
created_at
updated_at
```

Recommended unique constraint:

`(organization_id, plate_country, plate_number_normalized)`

## parking_spots

```text
id
organization_id
location_id
code
label
status
created_at
updated_at
```

Constraints:

- unique `(location_id, code)`
- ACTIVE / INACTIVE

## key_slots

```text
id
organization_id
location_id
code
status
created_at
updated_at
```

Constraints:

- unique `(location_id, code)`
- ACTIVE / INACTIVE

## valet_sessions

```text
id
public_token
organization_id
location_id
vehicle_id
customer_id nullable

state

parking_spot_id nullable
key_slot_id nullable
retrieval_assignee_membership_id nullable

checked_in_by_membership_id
released_by_membership_id nullable

created_at
intake_completed_at nullable
parked_at nullable
retrieval_requested_at nullable
retrieval_assigned_at nullable
retrieval_started_at nullable
ready_at nullable
released_at nullable
cancelled_at nullable

version
updated_at
```

Constraints/rules:

- public_token unique and unguessable
- state is exactly the state machine enum
- tenant/location relationships must be consistent
- RELEASED requires released_at
- CANCELLED requires cancelled_at
- use optimistic concurrency (`version`) or equivalent

Recommended partial unique protections:

- one non-terminal active session for a vehicle at a location
- one active session occupying a given parking spot
- one active session using a given key slot

## vehicle_photos

```text
id
organization_id
valet_session_id
capture_type
object_key
mime_type
size_bytes
captured_by_membership_id
captured_at
created_at
```

Capture types:

- FRONT
- REAR
- LEFT
- RIGHT
- DAMAGE_DETAIL
- OTHER

Rules:

- object_key unique
- image bytes not stored in PostgreSQL
- primary four intake photos required unless an authorized exception is recorded

## retrieval_requests

```text
id
organization_id
valet_session_id
requested_by_type
requested_by_customer_id nullable
requested_by_membership_id nullable
status
requested_at
cancelled_at nullable
created_at
```

requested_by_type:

- CUSTOMER
- STAFF

status:

- OPEN
- ACCEPTED
- CANCELLED
- COMPLETED

Constraint:

- one OPEN/ACCEPTED retrieval request per session

## handoff_verifications

```text
id
organization_id
valet_session_id
method
secret_hash nullable
expires_at nullable
attempt_count
max_attempts
verified_at nullable
verified_by_membership_id nullable
consumed_at nullable
override_reason nullable
created_at
```

Methods:

- OTP
- DYNAMIC_QR
- MANAGER_OVERRIDE

Rules:

- never persist plaintext OTP
- expiration required for OTP
- attempts limited
- verification one-time
- manager override requires authorized actor + reason + audit

## payments

```text
id
organization_id
valet_session_id
provider
provider_reference nullable
currency
amount
tip_amount
discount_amount
status
created_at
updated_at
paid_at nullable
```

Status:

- NOT_REQUIRED
- UNPAID
- PENDING
- PAID
- FAILED
- REFUNDED

Rules:

- no raw card data
- webhook processing idempotent
- financial records not hard-deleted

## incidents

```text
id
organization_id
location_id
valet_session_id
type
status
severity
description
reported_by_membership_id
created_at
resolved_at nullable
resolved_by_membership_id nullable
resolution_notes nullable
```

Status:

- OPEN
- INVESTIGATING
- RESOLVED
- CLOSED

## notifications

```text
id
organization_id
valet_session_id nullable
channel
recipient
template_key
status
provider_reference nullable
created_at
sent_at nullable
failed_at nullable
```

Channels:

- SMS
- WHATSAPP
- EMAIL

## audit_events

```text
id
organization_id
location_id
valet_session_id nullable
actor_membership_id nullable
event_type
entity_type
entity_id
metadata_json
idempotency_key nullable
occurred_at
created_at
```

Rules:

- append-only
- no normal update/delete API
- do not put secrets into metadata
- created in same DB transaction as protected domain mutation

## Required indexes

At minimum:

- `valet_sessions(location_id, state)`
- `valet_sessions(vehicle_id, created_at desc)`
- `valet_sessions(location_id, retrieval_requested_at)`
- `audit_events(valet_session_id, occurred_at)`
- `vehicle_photos(valet_session_id, captured_at)`
- `retrieval_requests(valet_session_id, status)`
- `shifts(location_id, status)`
- `incidents(location_id, status)`

## Deletion policy

Do not cascade-delete operational history.

Prefer disable/archive for configuration and people records.

Retention duration remains a legal/business decision.

## Atomic transaction rules

Must be atomic:

- state transition + audit event
- parking assignment + audit
- key assignment/movement + audit
- retrieval acceptance + assignee/state/audit
- handoff verification + release + audit
- manager override + reason + audit

## Idempotency

Design retry safety for:

- customer retrieval request
- payment webhook
- notification callbacks
- handoff action
- future offline synchronization
