# Requirements Traceability

Status: Reference bridge between the original concept and implementation docs.

Primary source:
`docs/reference/Valet_Project_Concept_Arabic.pdf`

This file does not replace the original concept.

| Concept requirement | Project representation |
|---|---|
| Digital valet from arrival to release | `01_PRODUCT_SCOPE.md` core workflow |
| Valet employee application | `apps/valet`, staff/session modules |
| Customer QR/SMS experience | `apps/customer`, guest token + notifications |
| Management dashboard | `apps/dashboard`, reporting module |
| Four condition photos | VehiclePhoto model + intake guard |
| Parking location | ParkingSpot entity/module |
| Key location | KeySlot entity/module |
| Bring My Car | RetrievalRequest + session transitions |
| Estimated/current retrieval progression | Session state + reporting; advanced prediction is future |
| Secure OTP/QR handoff | HandoffVerification + READY -> RELEASED guard |
| Vehicle Chain of Custody | AuditEvent + actor/timestamps on operational records |
| Digital payment/tip | Payment entity, provider adapter |
| Venue validation/discount | Future payment policy capability; not required for first workflow |
| Employee performance metrics | Reporting based on shift/session timestamps |
| Multi-location dashboard | Organization -> Location tenancy model |
| Key management | KeySlot + audit history |
| License plate AI/OCR | Explicitly out of first MVP |
| Damage Detection AI | Explicitly out of first MVP |
| Retrieval prediction | Explicitly future |
| Reservation | Explicitly out of first MVP |
| Anywhere Valet | Explicitly out of MVP |
| B2B/B2B2C operating model | Organization tenant + guest customer flow |
| Offline requirement | Architecture/idempotency/concurrency designed for later offline sync |
| Fast check-in | Product priority; avoid unnecessary mandatory fields |
| Liability/audit concerns | Security, evidence, audit and incident rules |
| Pilot with one location | `01_PRODUCT_SCOPE.md` validation goal |
| 100–200 vehicles/night | Core success criterion in `AGENTS.md` |

If implementation would contradict the original concept or this mapping, update the decision log before coding.
