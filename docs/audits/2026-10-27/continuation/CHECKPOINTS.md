# Continuation checkpoints

| Checkpoint | Disposition | Coverage | Evidence |
|---|---|---|---|
|C001|Partial; worker execution interrupted|577/4,705 files;60,379/610,400 lines|[report](checkpoints/C001.md), [summary](checkpoints/C001-coverage-summary.json)|
|C002|Partial C001 recovery; 2 owners finished|652/4,705 files;67,806/610,400 lines|[report](checkpoints/C002.md), [summary](checkpoints/C002-coverage-summary.json)|
|C003|C001 assigned files completed; global audit incomplete|796/4,705 files;83751/610,400 lines|[report](checkpoints/C003.md), [summary](checkpoints/C003-coverage-summary.json)|
|C004|Partial assigned continuation (125/245)|921/4,705 files;101749/610,400 lines|[report](checkpoints/C004.md), [summary](checkpoints/C004-coverage-summary.json)|
|C005|Additional C004 transfer semantic reviews|1041/4,705 files;113114/610,400 lines|[report](checkpoints/C005.md), [summary](checkpoints/C005-coverage-summary.json)|

The commit containing this file is the checkpoint publication identifier; inspect branch history to obtain it without a circular embedded commit hash. Original checkpoint38dd20039c051de39d172a2e3f440c68f3d60515 remains the direct documentation parent. No application code was rebased or changed.

|C006|Additional Dashboard E2E, API Dashboard and Employee Client review|1131/4,705 files;125491/610,400 lines|[report](checkpoints/C006.md), [summary](checkpoints/C006-coverage-summary.json)|

|C007|Seven-area semantic review with explicit startup-failure transfers|1306/4,705 files;147993/610,400 lines|[report](checkpoints/C007.md), [summary](checkpoints/C007-coverage-summary.json)|

|RB-001|Rebaseline to fetched `origin/main` `2c181fc3`; C001–C007 unchanged|1297/4,711 current-source files;147052/611038 lines;110 provisional files saved but not credited|[checkpoint](checkpoints/REBASELINE-2c181fc3.md), [full record](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/README.md)|

|D001|15 new/stale new-main semantic reviews and P2 monitoring candidate|1312/4,711 files;148631/611038 lines|[checkpoint](checkpoints/D001-2c181fc3.md), [summary](checkpoints/D001-2c181fc3-coverage-summary.json)|

|C008|Complete 180 disjoint semantic reviews at current main|1492/4,711 files;171431/611038 lines|[checkpoint](checkpoints/C008-2c181fc3.md), [summary](checkpoints/C008-2c181fc3-coverage-summary.json)|

|C009|Complete 180 disjoint semantic reviews at current main|1672/4,711 files;193240/611038 lines|[checkpoint](checkpoints/C009-2c181fc3.md), [summary](checkpoints/C009-2c181fc3-coverage-summary.json)|
