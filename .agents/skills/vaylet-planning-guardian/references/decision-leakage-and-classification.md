# Decision leakage & classification — v1.2

## Single-label rule

Every candidate assertion gets exactly one label: LOCKED, DERIVED, UNRESOLVED, or CONTRADICTED.

## CONTRADICTED threshold

Use CONTRADICTED only with affirmative higher-precedence evidence that the proposal cannot coexist with the repository contract. Missing implementation is not enough.

Bad: `SHIFT_ALREADY_ACTIVE` is absent, therefore contradicted.
Good: `403 for cross-tenant` is contradicted when a binding concealment rule requires 404.

## Leakage scan

For every UNRESOLVED item, search sections 8–10 and the test matrix for the same concept. Flag any selected value.

Examples of leakage:

- unresolved retry semantics -> plan says “return 200”;
- unresolved event semantics -> plan says “emit SHIFT_STARTED”;
- unresolved role matrix -> test says “supervisor succeeds”;
- unresolved eligibility policy -> helper says “must dynamically revalidate”.

Allowed form:

- `IF the Accepted Decision selects idempotent same-location retry, then ...`
- `Alternative A / Alternative B`, with neither presented as chosen.

## Evidence types

Mark reasoning mentally as:

- policy evidence: Accepted DEC / binding docs;
- integrity evidence: DB constraint/migration;
- implementation evidence: existing helper/controller/test;
- convention evidence: repeated repository pattern;
- inference: planner reasoning only.

Do not upgrade convention or inference into LOCKED policy.

## v1.3 additions

### Proposition polarity

Classify the candidate proposition itself. Evidence for the opposite behavior means the candidate may be `CONTRADICTED`; do not rewrite it and call the rewritten version `DERIVED`.

Watch for qualifier injection: `when validated`, `if safe`, `for authorized locations`, `under normal circumstances`. If those words were not part of the candidate, they cannot be used to silently rescue it.

### Semantic leakage, not just string leakage

An unresolved choice can leak without reusing the same identifier. Examples:

- `dynamic vs captured eligibility` unresolved -> later mandatory joins against current statuses/access;
- `locking strategy` unresolved -> later mandatory `FOR SHARE`;
- `route` unresolved -> later concrete `@Controller("v1/staff/shifts")`;
- `downstream boundary` unresolved -> later exact function signature and output DTO.

Use U-IDs and compare concepts across sections.

### Artifact leakage

Under `DECISION REQUIRED`, exact new file names, exported symbols, or schemas are not `definitely required` unless repository architecture itself forces them. Keep decision-dependent artifacts conditional.

### Retain the proposition in classification output

For adversarial numbered requirements, include the requirement proposition itself in the classification entry. An ID plus classification plus rationale is insufficient because a rationale can accidentally describe the opposite policy while the wrong classification survives unnoticed.
