# Issue #310 — Delivery file manifest

Every task-changed file relative to original `de338f4da187297aacd0fc7005ece9b6f041fe61`. Runtime scratch, generated Android projects and build output are ignored and excluded. This inventory includes the separately pushed master plan.

| File | Reason |
|---|---|
| [apps/valet-native/app/whatsapp-prototype.tsx](../../../apps/valet-native/app/whatsapp-prototype.tsx) | Development-only finite fixture route; release returns null. |
| [apps/valet-native/src/check-in/native-check-in-parking-task-step.tsx](../../../apps/valet-native/src/check-in/native-check-in-parking-task-step.tsx) | Optional development-only slot after original Guest Access; seven additions, no removals. |
| [apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-button.tsx](../../../apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-button.tsx) | Isolated fixture presentation: button. No backend/client action. |
| [apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-fixture.ts](../../../apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-fixture.ts) | Isolated fixture presentation: fixture. No backend/client action. |
| [apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-logo.tsx](../../../apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-logo.tsx) | Isolated fixture presentation: logo. No backend/client action. |
| [apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-palette.ts](../../../apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-palette.ts) | Isolated fixture presentation: palette. No backend/client action. |
| [apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-screen.tsx](../../../apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-screen.tsx) | Isolated fixture presentation: screen. No backend/client action. |
| [apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-state.ts](../../../apps/valet-native/src/prototypes/whatsapp/native-whatsapp-prototype-state.ts) | Isolated fixture presentation: state. No backend/client action. |
| [apps/valet-native/test/fixtures/issue-310-parking-task-baseline.json](../../../apps/valet-native/test/fixtures/issue-310-parking-task-baseline.json) | New immutable original-source rendered-tree/style baseline for four locale/theme combinations. |
| [apps/valet-native/test/issue-310-whatsapp-button.test.tsx](../../../apps/valet-native/test/issue-310-whatsapp-button.test.tsx) | Prototype isolation, parity, callbacks, accessibility, state/contrast or route regression checks. |
| [apps/valet-native/test/issue-310-whatsapp-parity.test.tsx](../../../apps/valet-native/test/issue-310-whatsapp-parity.test.tsx) | Prototype isolation, parity, callbacks, accessibility, state/contrast or route regression checks. |
| [apps/valet-native/test/issue-310-whatsapp-route.test.tsx](../../../apps/valet-native/test/issue-310-whatsapp-route.test.tsx) | Prototype isolation, parity, callbacks, accessibility, state/contrast or route regression checks. |
| [apps/valet-native/test/native-appearance-coverage.test.ts](../../../apps/valet-native/test/native-appearance-coverage.test.ts) | Exact new fixture-palette exception; existing color guards retained. |
| [apps/valet-native/test/native-appearance-style-freeze.test.ts](../../../apps/valet-native/test/native-appearance-style-freeze.test.ts) | Exact new stylesheet inventory exception; every original baseline stays compared. |
| [docs/plans/issue-310/DELIVERY_FILE_MANIFEST.md](DELIVERY_FILE_MANIFEST.md) | Reviewable specification, validation, capture inventory or complete file manifest. |
| [docs/plans/issue-310/ISSUE_310_WHATSAPP_GUEST_ACCESS_MASTER_IMPLEMENTATION_PLAN.md](ISSUE_310_WHATSAPP_GUEST_ACCESS_MASTER_IMPLEMENTATION_PLAN.md) | Complete future implementation plan A–U, decisions and release gates; pushed before prototype. |
| [docs/plans/issue-310/PROTOTYPE_VALIDATION_EVIDENCE.md](PROTOTYPE_VALIDATION_EVIDENCE.md) | Reviewable specification, validation, capture inventory or complete file manifest. |
| [docs/plans/issue-310/PROTOTYPE_VISUAL_PARITY_SPEC.md](PROTOTYPE_VISUAL_PARITY_SPEC.md) | Reviewable specification, validation, capture inventory or complete file manifest. |
| [docs/plans/issue-310/qa-artifacts/README.md](qa-artifacts/README.md) | Reviewable specification, validation, capture inventory or complete file manifest. |
| [docs/plans/issue-310/qa-artifacts/baseline-small-dark-ar.json](qa-artifacts/baseline-small-dark-ar.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/baseline-small-dark-ar.png](qa-artifacts/baseline-small-dark-ar.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/baseline-small-dark-en.json](qa-artifacts/baseline-small-dark-en.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/baseline-small-dark-en.png](qa-artifacts/baseline-small-dark-en.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/baseline-small-light-ar.json](qa-artifacts/baseline-small-light-ar.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/baseline-small-light-ar.png](qa-artifacts/baseline-small-light-ar.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/baseline-small-light-en.json](qa-artifacts/baseline-small-light-en.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/baseline-small-light-en.png](qa-artifacts/baseline-small-light-en.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/baseline-standard-dark-ar.json](qa-artifacts/baseline-standard-dark-ar.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/baseline-standard-dark-ar.png](qa-artifacts/baseline-standard-dark-ar.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/baseline-standard-dark-en.json](qa-artifacts/baseline-standard-dark-en.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/baseline-standard-dark-en.png](qa-artifacts/baseline-standard-dark-en.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/baseline-standard-light-ar.json](qa-artifacts/baseline-standard-light-ar.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/baseline-standard-light-ar.png](qa-artifacts/baseline-standard-light-ar.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/baseline-standard-light-en.json](qa-artifacts/baseline-standard-light-en.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/baseline-standard-light-en.png](qa-artifacts/baseline-standard-light-en.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/interaction-small-light-en-queued.json](qa-artifacts/interaction-small-light-en-queued.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/interaction-small-light-en-queued.png](qa-artifacts/interaction-small-light-en-queued.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/pixel-comparison.json](qa-artifacts/pixel-comparison.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-dark-ar-scrolled.json](qa-artifacts/prototype-small-dark-ar-scrolled.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-dark-ar-scrolled.png](qa-artifacts/prototype-small-dark-ar-scrolled.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-dark-ar.json](qa-artifacts/prototype-small-dark-ar.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-dark-ar.png](qa-artifacts/prototype-small-dark-ar.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-dark-en.json](qa-artifacts/prototype-small-dark-en.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-dark-en.png](qa-artifacts/prototype-small-dark-en.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-light-ar.json](qa-artifacts/prototype-small-light-ar.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-light-ar.png](qa-artifacts/prototype-small-light-ar.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-light-en-scrolled.json](qa-artifacts/prototype-small-light-en-scrolled.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-light-en-scrolled.png](qa-artifacts/prototype-small-light-en-scrolled.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-light-en.json](qa-artifacts/prototype-small-light-en.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-small-light-en.png](qa-artifacts/prototype-small-light-en.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/prototype-standard-dark-ar.json](qa-artifacts/prototype-standard-dark-ar.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-standard-dark-ar.png](qa-artifacts/prototype-standard-dark-ar.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/prototype-standard-dark-en.json](qa-artifacts/prototype-standard-dark-en.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-standard-dark-en.png](qa-artifacts/prototype-standard-dark-en.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/prototype-standard-light-ar.json](qa-artifacts/prototype-standard-light-ar.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-standard-light-ar.png](qa-artifacts/prototype-standard-light-ar.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/prototype-standard-light-en.json](qa-artifacts/prototype-standard-light-en.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/prototype-standard-light-en.png](qa-artifacts/prototype-standard-light-en.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-accepted.json](qa-artifacts/variant-standard-light-en-accepted.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-accepted.png](qa-artifacts/variant-standard-light-en-accepted.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-delivered.json](qa-artifacts/variant-standard-light-en-delivered.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-delivered.png](qa-artifacts/variant-standard-light-en-delivered.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-disabled.json](qa-artifacts/variant-standard-light-en-disabled.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-disabled.png](qa-artifacts/variant-standard-light-en-disabled.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-failed.json](qa-artifacts/variant-standard-light-en-failed.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-failed.png](qa-artifacts/variant-standard-light-en-failed.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-loading.json](qa-artifacts/variant-standard-light-en-loading.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-loading.png](qa-artifacts/variant-standard-light-en-loading.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-pressed.json](qa-artifacts/variant-standard-light-en-pressed.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-pressed.png](qa-artifacts/variant-standard-light-en-pressed.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-queued.json](qa-artifacts/variant-standard-light-en-queued.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-queued.png](qa-artifacts/variant-standard-light-en-queued.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-unknown.json](qa-artifacts/variant-standard-light-en-unknown.json) | Capture dimensions/accessibility/hash metadata or bounded pixel-comparison result. |
| [docs/plans/issue-310/qa-artifacts/variant-standard-light-en-unknown.png](qa-artifacts/variant-standard-light-en-unknown.png) | Genuine Native capture; purpose/preset encoded in filename and capture inventory. |

No production backend, contract, dependency, schema/migration, shared UI token, locale dictionary, navigation implementation or operational workflow file is changed.
