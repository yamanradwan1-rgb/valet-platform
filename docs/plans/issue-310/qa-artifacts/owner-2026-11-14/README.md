# Owner refinement visual evidence — 2026-11-14

**PARTIAL — 0 new PNG captures accepted.** This directory must not be presented as refreshed screenshot or pixel-parity proof.

The exact candidate Native source inventory is [source-files.json](source-files.json). It records SHA-256 for tracked app/src authored code, normalizing CRLF to LF, against initial task HEAD `0a1d40c0`. It describes source, not a successful render. Immutable final source identity is recorded in the [validation evidence](../../PROTOTYPE_VALIDATION_EVIDENCE.md).

## Attempts actually performed

1. Reused task-owned `vaylet310-ui` AVD, emulator-5580, installed x86_64 API37.1/16KiB image and the prior compatible development APK. Cold boot with host graphics, Vulkan disabled, RAM1536MiB and two cores. Boot property reached 1. Metro from this worktree successfully bundled 2664 modules; loopback bridge/ADB reverse were verified. The app then exposed Android's “VAYLET Employee isn't responding” dialog. The capture helper refused the hierarchy/unfinished render; no PNG was accepted.
2. Stopped only that emulator and restarted the same task AVD with RAM1024MiB to reduce this task's footprint. It did not reach a usable booted fixture during the attempt. The host reported roughly 0.25–0.43GiB free physical memory out of 16GiB during these attempts. This is an observed resource condition, not proof that the source caused an ANR or a production device defect.

The 1536MiB and 1024MiB attempts, task-owned Metro and loopback bridge were stopped before the full Native suite. No unrelated app/AVD/process was stopped, no device account signed in, and no business/provider API or real WhatsApp message was used. Initial failed launcher/ANR diagnostics remain in ignored scratch, not product screenshots.

## Explicit pending capture matrix

| Required view | Current evidence |
|---|---|
| Default English Light/Dark, standard and small | NOT CAPTURED |
| Default Arabic Light/Dark, standard and small | NOT CAPTURED |
| Immediate Sending… / جاري الإرسال… + spinner after a real emulator tap | NOT CAPTURED; component/lifecycle tests only |
| Pressed, Queued, Meta accepted, Failed, UNKNOWN, simulated Delivered, Disabled | NOT CAPTURED for new labels; exact EN/AR labels tested |
| Small-screen scroll reachability / Arabic long-label fit | NOT REVERIFIED for new copy |
| Matched new baseline/prototype pixel comparison | NOT RUN; no new valid pair |
| Physical Android/iOS, TalkBack, large accessibility fonts, Owner reference | NOT VERIFIED |

No combination is claimed captured. The earlier 27 PNGs and eight zero-difference comparisons under the parent directory remain **historical pre-refinement** evidence only; do not use them to prove the new text.

## Reproduction when resources are available

Use the existing development APK/runtime and branch Metro, never production action wiring. Development route `/whatsapp-prototype?locale=en&theme=light&state=default`; finite states include pressed/loading/queued/accepted/failed/unknown/delivered/disabled. `baseline=1` omits the optional control in the same unchanged Parking Task source. Source hashes must match before capturing.

Standard preset: 780×1688 physical at density320 (390×844 logical). Small: 640×1136 at density320 (320×568 logical). Keep runtime, fonts, locale/theme, data, density, scroll, system animation settings and font scale identical per pair. Save real `adb shell screencap -p` PNGs and inspected control bounds/accessibility/hash metadata. Mask only Android system chrome and the new button with recorded bounds; disclose necessary content-height/scroll differences. Do not edit pixels or expand masks to hide original UI changes. Delivered remains a local design simulation, not provider evidence.
