# Before/after evidence

All screenshots use synthetic fixtures. Before = base
`90aa90a89593df95b8fd6e41f7d6c97bb42284a4`; after = implementation branch.

- `*-en-*`: English / LTR / Light / 390px / 100%.
- `*-ar-*`: Arabic / RTL / Dark / 1440px / 100%.
- `location-*`: existing lifecycle fieldset; only Resume action is added.
- `presence-*`: existing disable dialog; feedback text changes only.
- `cash-*`: existing Shift Details drawer with the read-only fact section added.

The standard Next development indicator is hidden in this evidence harness only.
No application CSS or UI setting is changed. Existing sticky topbar painting may
appear at the edge of an element screenshot in both versions. Full matrix
captures additionally cover 320/390/768/1440px and CSS zoom 100%/200% in both
languages and themes. See ../RESULTS.md and ../UI_INVENTORY.md.
