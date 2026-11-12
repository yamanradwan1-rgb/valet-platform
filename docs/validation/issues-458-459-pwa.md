# Dashboard and Guest launcher icons (#459 and #458)

The Owner approved `D459-Titanium-v1` for Management Dashboard and `G458-Slate-v1` for Guest in the implementation handoff. The archives contain the exact reviewed PNGs. Both source images were 512 × 512 opaque RGB PNGs.

| Source | SHA-256 |
| --- | --- |
| `manegment (2).png` | `697c9c3ee5755f5402d3e143f7efa5b6af35df87fa802ff36dba2ff0f946f0a1` |
| `costamer.png` | `d784fc8d102ce78805c863f0ed2208fc4608b886ed3eea50422d9b807142b4a2` |

| PNG | Dashboard Titanium SHA-256 | Guest Slate SHA-256 |
| --- | --- | --- |
| `icon-192.png` | `7553d79e3b7a4a4139b3c7aa74ffb3da06c84194bfa258a82e6e0b3e0a7a9380` | `72fe5fd48787bd61bc68ee76a2f79ef927ceec89f268ebb3c9e38b54a3a9d4b5` |
| `icon-512.png` | `2d3ead1e7a8b14dbb46e937fd1a98057a055c92d33a82e3d1ebd1d48847ab739` | `d784fc8d102ce78805c863f0ed2208fc4608b886ed3eea50422d9b807142b4a2` |
| `icon-maskable-512.png` | `c5051c04358929adc055552fb8374b5f8b71bbf55b743dbba6111a1d6a191d3a` | `c772cf321cc5bf40ea1d392969ee7b9648cc12f057d06f29c73d201e31acd1d3` |
| `apple-touch-icon.png` | `5b53fc14e97d2bc6f7ebe918c4ca8bd79948b5499fddcb1eb96570d4b29c7206` | `8d50093a0193dd7a8c7014a89fb4737bb9aedadfea0fa4d3ca5bb1eb919326e9` |

Dashboard QA returned 404 for the manifest and Chromium reported `no-manifest` on `/` and `/overview`. The Dashboard adds a Next App Router manifest with its own stable ID and the existing protected root as its launch URL. The build copies public assets and Next static files into its standalone output. Chrome menu installation does not require a service worker with a fetch handler, so the Dashboard adds no worker or offline caching. See [Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria) and [Next standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

Guest QA served the legacy icons with a four-hour HTTP cache lifetime. The new Slate URLs are versioned so fresh clients can request the new artwork directly. The legacy URLs remain available for previously rendered or cached manifests and pages. The existing worker handles both sets using its exact public asset list and network-first icon policy. The manifest URL, app identity, launch route, scope, cache namespace, and notification handling stay in place. Installed Android and iOS launchers may retain old artwork independently of HTTP caches. Check both fresh and existing installations before making a refresh claim.

These changes are public application metadata. No ValetSession, Task/Dispatch, tenant or location authorization, schema, database index, or Company/Location configuration policy is affected.
