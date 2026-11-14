# Issue #310 — Native capture inventory

**November 14 Owner refinement:** visible Demo/تجريبي copy below is historical. [Current source/capture-attempt inventory](owner-2026-11-14/README.md): **PARTIAL, zero new PNGs accepted**. Default/Sending/remaining-state EN/AR/theme/size/label-fit/pixel checks for the new copy remain pending. Do not treat the older captures or comparisons as fresh proof.

Real Android emulator captures; synthetic fixture data only. See [validation evidence](../PROTOTYPE_VALIDATION_EVIDENCE.md) for runtime identity, comparison exclusions and limits.

| Capture | Metadata | Purpose |
|---|---|---|
| [baseline-small-dark-ar](baseline-small-dark-ar.png) | [JSON](baseline-small-dark-ar.json) | Original-source baseline |
| [baseline-small-dark-en](baseline-small-dark-en.png) | [JSON](baseline-small-dark-en.json) | Original-source baseline |
| [baseline-small-light-ar](baseline-small-light-ar.png) | [JSON](baseline-small-light-ar.json) | Original-source baseline |
| [baseline-small-light-en](baseline-small-light-en.png) | [JSON](baseline-small-light-en.json) | Original-source baseline |
| [baseline-standard-dark-ar](baseline-standard-dark-ar.png) | [JSON](baseline-standard-dark-ar.json) | Original-source baseline |
| [baseline-standard-dark-en](baseline-standard-dark-en.png) | [JSON](baseline-standard-dark-en.json) | Original-source baseline |
| [baseline-standard-light-ar](baseline-standard-light-ar.png) | [JSON](baseline-standard-light-ar.json) | Original-source baseline |
| [baseline-standard-light-en](baseline-standard-light-en.png) | [JSON](baseline-standard-light-en.json) | Original-source baseline |
| [interaction-small-light-en-queued](interaction-small-light-en-queued.png) | [JSON](interaction-small-light-en-queued.json) | Local tap → queued |
| [prototype-small-dark-ar-scrolled](prototype-small-dark-ar-scrolled.png) | [JSON](prototype-small-dark-ar-scrolled.json) | Scroll reachability |
| [prototype-small-dark-ar](prototype-small-dark-ar.png) | [JSON](prototype-small-dark-ar.json) | Candidate matched viewport |
| [prototype-small-dark-en](prototype-small-dark-en.png) | [JSON](prototype-small-dark-en.json) | Candidate matched viewport |
| [prototype-small-light-ar](prototype-small-light-ar.png) | [JSON](prototype-small-light-ar.json) | Candidate matched viewport |
| [prototype-small-light-en-scrolled](prototype-small-light-en-scrolled.png) | [JSON](prototype-small-light-en-scrolled.json) | Scroll reachability |
| [prototype-small-light-en](prototype-small-light-en.png) | [JSON](prototype-small-light-en.json) | Candidate matched viewport |
| [prototype-standard-dark-ar](prototype-standard-dark-ar.png) | [JSON](prototype-standard-dark-ar.json) | Candidate matched viewport |
| [prototype-standard-dark-en](prototype-standard-dark-en.png) | [JSON](prototype-standard-dark-en.json) | Candidate matched viewport |
| [prototype-standard-light-ar](prototype-standard-light-ar.png) | [JSON](prototype-standard-light-ar.json) | Candidate matched viewport |
| [prototype-standard-light-en](prototype-standard-light-en.png) | [JSON](prototype-standard-light-en.json) | Candidate matched viewport |
| [variant-standard-light-en-accepted](variant-standard-light-en-accepted.png) | [JSON](variant-standard-light-en-accepted.json) | Deterministic demo state |
| [variant-standard-light-en-delivered](variant-standard-light-en-delivered.png) | [JSON](variant-standard-light-en-delivered.json) | Deterministic demo state |
| [variant-standard-light-en-disabled](variant-standard-light-en-disabled.png) | [JSON](variant-standard-light-en-disabled.json) | Deterministic demo state |
| [variant-standard-light-en-failed](variant-standard-light-en-failed.png) | [JSON](variant-standard-light-en-failed.json) | Deterministic demo state |
| [variant-standard-light-en-loading](variant-standard-light-en-loading.png) | [JSON](variant-standard-light-en-loading.json) | Deterministic demo state |
| [variant-standard-light-en-pressed](variant-standard-light-en-pressed.png) | [JSON](variant-standard-light-en-pressed.json) | Deterministic demo state |
| [variant-standard-light-en-queued](variant-standard-light-en-queued.png) | [JSON](variant-standard-light-en-queued.json) | Deterministic demo state |
| [variant-standard-light-en-unknown](variant-standard-light-en-unknown.png) | [JSON](variant-standard-light-en-unknown.json) | Deterministic demo state |

[Eight-pair pixel comparison](pixel-comparison.json): 0 changed original-product pixels in each pair after the documented system-chrome/new-control exclusions. Native screenshots were not edited.

Reproduce with the development route and finite parameters described in the evidence. Capture original plan-commit Parking Task source and candidate source with identical runtime/preset/theme/locale, hide only Expo developer overlays, and use `adb shell screencap -p` plus `adb pull`. Read control bounds from `uiautomator dump`; compare RGB pixels excluding only system rows/new-control bounds as recorded in the comparison JSON. Restore candidate source before any commit. Do not use live staff/customer data.
