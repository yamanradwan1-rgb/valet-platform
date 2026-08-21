# OMEGA Reasoning Closure Checklist

Use this checklist before finalizing high-risk or adversarial VAYLET plans.

## 1. Proposition polarity

- Did I classify the exact assertion given?
- Did I accidentally explain the correct opposite and label the original assertion DERIVED?
- Did I silently add qualifiers such as `when validated`?

## 2. Pattern versus policy

For every inference from current code, mark it as:

- capability;
- convention;
- current policy;
- new-task policy.

Only repository authority can lock the last category.

## 3. Decision firewall

Assign U-IDs to critical unresolved items. Search every later section for semantic selection of each U-ID.

Look especially for selected:

- routes;
- statuses/errors;
- event names;
- role lists;
- DTO fields;
- function signatures;
- persistence columns;
- dynamic/captured authorization;
- retry outcomes;
- lock/isolation mechanisms.

## 4. Concurrency proof

For each material race provide:

- Tx A / Tx B;
- rows/resources;
- read/write/lock sequence;
- unsafe interleaving;
- existing protection;
- missing protection;
- linearization point if proven;
- owner task/slice.

When uncommitted state matters, branch on commit, rollback, and unknown caller outcome.

## 5. Mechanism firewall

Do not turn a candidate lock/isolation mechanism into `MUST` while the mechanism remains undecided.

## 6. Free-text audit privacy

Safe key != safe value. Review secret-bearing values, sensitive text, length, normalization, retention, and necessity.

## 7. Downstream atomicity

A boolean eligibility query does not close a future assignment race. State the consumer's transaction/write obligation without pulling future persistence into the current slice.

## 8. Falsification coverage

Every LOCKED/DERIVED conclusion gets a falsifier and a search result. Report N/N coverage for large plans.

## 9. Test purity

Tests may prove locked/derived behavior or remain conditional. They must not crystallize unresolved policy.

## 10. Artifact prediction

Under DECISION REQUIRED, split file predictions into definite, conditional, and unjustified. Exact new helpers/files are conditional unless repository architecture forces them.
