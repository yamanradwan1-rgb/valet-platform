# Continuation evidence manifest

All entries are sanitized text artifacts. SHA-256 hashes cover exact bytes. This manifest excludes its own hash; Git commit supplies its integrity anchor. Original evidence-manifest.md and coverage-ledger.csv remain unchanged in the parent audit directory.

Evidence mapping: SEC-011 → FINDINGS_REGISTER, FINDING_VALIDATION, security saved review records and actual-service model script/output. File coverage → progress CSV, C001 review records/assignments/summary and original ownership inventory. Rejections/open hypotheses → FALSE_POSITIVE_DISPOSITIONS, coordinator review records. Feature/runtime limits → FEATURE_COVERAGE, CROSS_FEATURE_RISKS, TEST_EVIDENCE and SECURITY_COVERAGE. Frozen source paths/hashes are embedded in assignments/results and model output; source code is linked at exact baseline instead of duplicating repository files.

Intentionally excluded: original raw VAYLET_AUDIT_EVIDENCE.zip (not republished; prior sanitized extraction remains available); local helper/cache/bytecode files (implementation scaffolding, not review evidence); unsaved worker reads and absent final reports (cannot substantiate full review); real environment files, machine configuration, credentials/cookies, provider/production logs, database dumps, screenshots and private network details (unneeded and unsafe to publish). No new screenshots or production/customer data were collected. Model-generated keys/seeds/codes remain in memory and are never printed. Existing repository test credential strings are not copied into evidence.

No evidence archive, Git LFS, dependency installation or size-limit bypass. New evidence comprises worker semantic notes and a small synthetic source-model reproduction, whose substitutions/limits are explicit. Secrets review inspected all new text; pattern screening is supplemental, not a claim to prove the absence of every possible secret.

| Path | SHA-256 |
|---|---|
|[AUDIT_PROGRESS.md](AUDIT_PROGRESS.md)|`bfda87964671fafb8131592ae3b78e0c4a833173ee656c5ac63697017d28a424`|
|[CHECKPOINTS.md](CHECKPOINTS.md)|`8feb266a1f3bc212966fb4e77666c939187b014e93907a955e9d1522f3b9011f`|
|[CROSS_FEATURE_RISKS.md](CROSS_FEATURE_RISKS.md)|`c18c0e6a56fa15e4f7889539cf2d4664d73b80b4f371d234f273c201b1a24872`|
|[FALSE_POSITIVE_DISPOSITIONS.md](FALSE_POSITIVE_DISPOSITIONS.md)|`c292f9ebb470be6bb36a18c0fcaf5efc7d86920d1bf881ef8e0f7852baff5677`|
|[FEATURE_COVERAGE.md](FEATURE_COVERAGE.md)|`dbb757dad7bdc3b58ecf607047a164a233a825df69d35501332923eabec4e4bd`|
|[FINDINGS_REGISTER.md](FINDINGS_REGISTER.md)|`33d9ba11db0d1a845831df0218b2e84aee73625481178fa29660f9c070a59954`|
|[FINDING_VALIDATION.md](FINDING_VALIDATION.md)|`0a7524f26c7a50b3046ed7caaad1e1dbc309e070efde98b37701b50cda51ecdc`|
|[README.md](README.md)|`1e8c1f4f6e6fad421417fd1ee900afc96ab73f34d7fe591d1073bddf88d5f182`|
|[SECURITY_COVERAGE.md](SECURITY_COVERAGE.md)|`058f37838280b439cddf5b4d959634fcb032c95b04073425bfe562d293a18b00`|
|[TEST_EVIDENCE.md](TEST_EVIDENCE.md)|`67b8730fb25e2de29df38f63dd9455673dc9b8342f87a83070862f4f5eb694c9`|
|[checkpoints/C001-assignments.json](checkpoints/C001-assignments.json)|`01b5e193f8ce4d782e3e1080c1548efd554dc66342f54e2c3ebc541d817d9e9a`|
|[checkpoints/C001-coverage-summary.json](checkpoints/C001-coverage-summary.json)|`2a268b1a55db35335cc1a6d5f6488b66426d397ede4e79f3d2d06278d45cf99b`|
|[checkpoints/C001-pending-files.txt](checkpoints/C001-pending-files.txt)|`46b8e0c75777785eafecb40b2ace46498dbbbb88b24d6185bf824a273271d2fb`|
|[checkpoints/C001-review-records.json](checkpoints/C001-review-records.json)|`f8bd33299bad029a32e74216e6410adccc7d3fef19784a3b097f2be9edc1100a`|
|[checkpoints/C001-starting-plan.json](checkpoints/C001-starting-plan.json)|`b720e961d38219dc37a824f1544dedf734dc3cf23de5d96f5e89ffc2a9c53be3`|
|[checkpoints/C001.md](checkpoints/C001.md)|`551fb92ff48dea356b2e3b429572afa1f96ac210ad795d536cd203b521cb7b81`|
|[checkpoints/initial-remaining-ownership.json](checkpoints/initial-remaining-ownership.json)|`6a074f7595eaee2f81871527096f9bf4e141b1de5d2da2e0124897bb7bf05976`|
|[coverage-ledger-progress.csv](coverage-ledger-progress.csv)|`720ff1bc84a14ff866c3b78a2d194db23dd0dce51eeb8c84578bc107c7478056`|
|[evidence/C001-backend_operations-saved-results.json](evidence/C001-backend_operations-saved-results.json)|`f821e43cd83b2fcd4cd51a29deac4fa17f26d74b4091034c40e4afb8202bf97d`|
|[evidence/C001-coordinator-saved-results.json](evidence/C001-coordinator-saved-results.json)|`c4e71aa94b824c60ac56db4da66f6aab25b95c75cef7177c5be02a83ae3ca8e3`|
|[evidence/C001-customer-saved-results.json](evidence/C001-customer-saved-results.json)|`347ff3aa7f1ac540e588b07eed30b33d326d5bd6373cef661f25c4faa0538048`|
|[evidence/C001-dashboard-saved-results.json](evidence/C001-dashboard-saved-results.json)|`3c12c5667444b79f06f4b3f807db723a2693ffa3300a2932a5336cbeac167407`|
|[evidence/C001-database-saved-results.json](evidence/C001-database-saved-results.json)|`aed6134553b46e7a2807cecfd1c64f823d38f0906e08eb0dc2341a8602cca67a`|
|[evidence/C001-native-saved-results.json](evidence/C001-native-saved-results.json)|`5fc4e72d0605bef9301b13d289cde83f35136be3fe8a2c8c6f1a1df4fa7f52c2`|
|[evidence/C001-security-saved-results.json](evidence/C001-security-saved-results.json)|`92f5dbf89fda7a1c1f907119f22a1e61ba6a9b455f7e36e07de0d0e63572c4fe`|
|[evidence/mfa-recovery-session-model.cjs](evidence/mfa-recovery-session-model.cjs)|`586e58d79509a4dd255d277e217f553c2d4b43f469cca4625d7dc0fd01af44e8`|
|[evidence/mfa-recovery-session-model.txt](evidence/mfa-recovery-session-model.txt)|`d555d6fec32b0b3641beec480152cab77add08668cbcacfae998409635e20914`|
|[remaining-files.txt](remaining-files.txt)|`6bf4a03b3f3c236a4c885e977a9bc1e1697875ee30583dd10f50ee3e49ce7055`|

## C002 additions (same frozen source)

| Path | SHA-256 |
|---|---|
|[checkpoints/C002.md](checkpoints/C002.md)|`6153e1e935e6615986d2205b67d0dfea60e2eb9af35a8640958fb75f60b0800a`|
|[checkpoints/C002-review-records.json](checkpoints/C002-review-records.json)|`f2d85c46796c028e4542bc081b9ed5f02855821973757872c2d40773bf293ae8`|
|[checkpoints/C002-pending-files.txt](checkpoints/C002-pending-files.txt)|`5ba53f5d16914be8190c74595ef5c7878fd9ee4e94d84f0337b828d322c2f286`|
|[checkpoints/C002-coverage-summary.json](checkpoints/C002-coverage-summary.json)|`24a7a4b94dfc050d8bdf3d15bbe3f87f9ce632a2d46f60d4932966367a4fbcd3`|
|[evidence/C002-backend_operations-results.json](evidence/C002-backend_operations-results.json)|`183e03d2a0f427ea789d7460d9c1f12836b5d29df9f58829eb264afa8d4964cb`|
|[evidence/C002-native-results.json](evidence/C002-native-results.json)|`c3c4e88560908e0ab2894c86125d3196b1b6713ecc38a9f2240d551cc1f270cc`|
|[evidence/C002-cross-feature.json](evidence/C002-cross-feature.json)|`e07a2d791294d8324eed7943e2f1aba65c3cb252d10a48a47c90dd12db5d9b29`|
|[evidence/C002-evidence-qa.json](evidence/C002-evidence-qa.json)|`4704fd29d1bfb082d9552c3ce9ef2b370c499dc7e64abb7c792c853f13b7abaa`|

## C003 additions (same frozen source)

| Path | SHA-256 |
|---|---|
|[checkpoints/C003.md](checkpoints/C003.md)|`c151bdd8026f2e7ae861997bad17f7059d394c31f5825bb6fe7edef12f2e18f4`|
|[checkpoints/C003-coverage-summary.json](checkpoints/C003-coverage-summary.json)|`593b09f86e32713f596b972a24e3ae00416bb228ab74209ec45d177f0cca6f54`|
|[checkpoints/C003-review-records.json](checkpoints/C003-review-records.json)|`929d7f3b619196384eccede59e12be5d3e172bc2dc5ac269c1f1b275be9440cb`|
|[checkpoints/C003-pending-files.txt](checkpoints/C003-pending-files.txt)|`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`|
|[checkpoints/C003-ownership-transfers.json](checkpoints/C003-ownership-transfers.json)|`535a4c7c556aa3180e6b3f1b4871d84eea5831bd51f68eb0225277702331e4d1`|
|[evidence/C003-worker-1-results.json](evidence/C003-worker-1-results.json)|`81978964d9aaed77ff8c87ba11e43e196e9f89a81307bfd009804a58df7e2fab`|
|[evidence/C003-worker-4-results.json](evidence/C003-worker-4-results.json)|`bfc734c2f48d89a8c0a292a914ebaeaa37bbee449c3ef5dfdab2ac28c522bae8`|
|[evidence/C003-worker-7-results.json](evidence/C003-worker-7-results.json)|`a7d5749a60949cd4c43287d7930344b2862d18f7336168ebe6015a0c00a86aa3`|
|[evidence/C003-DASH-AUTH-01.json](evidence/C003-DASH-AUTH-01.json)|`2f38ae8b66b8f4a641417cfd1319bdc7213c67119a015bc650546eacb6357fa4`|
|[evidence/C003-DASH-I18N-01.json](evidence/C003-DASH-I18N-01.json)|`0b71bd680575229ae22fdb70db8566c059e5d2fb11b7e77417b4924e7d1694c8`|

## C004 partial additions (same frozen source)

| Path | SHA-256 |
|---|---|
|[checkpoints/C004.md](checkpoints/C004.md)|`99e508e094e2980b5f2c9335fd5b479594b30a27643d1d93b92f113793beb15d`|
|[checkpoints/C004-coverage-summary.json](checkpoints/C004-coverage-summary.json)|`10da54f2ab7f212dacb9808651206387aed489ebec3f4988c5d23bbe2c83d53f`|
|[checkpoints/C004-review-records.json](checkpoints/C004-review-records.json)|`24fc9ff0ba50975177d340a5130795223cbfc7d6a46d579e00cdaaafa8c2a034`|
|[checkpoints/C004-pending-files.json](checkpoints/C004-pending-files.json)|`3ac93023912c39d03a6bb94aabb0fbd48520f95000db93e2c2b3599242ebae01`|
|[checkpoints/C004-ownership-transfers.json](checkpoints/C004-ownership-transfers.json)|`ad89181f5e90d31476a6147c6127abafd9d5d4a2c9c52cff6e09c148850e19e1`|
|[evidence/C004-native-prime-results.json](evidence/C004-native-prime-results.json)|`0de5b1e6408c91f6e83715dcb3014bc4356c9fc0ce3aa518277c5e2f57a319b2`|
|[evidence/C004-dashboard-results.json](evidence/C004-dashboard-results.json)|`3631d9757d796c151311a2c0cd5f044ffe9cc8a2369e437f4048cbb2050455be`|
|[evidence/C004-database-results.json](evidence/C004-database-results.json)|`69f0ab9478841edab97d4126a3e588a85e1ebe7afd1ccebded1cf78b2b796c22`|
|[evidence/C004-dashboard-transfers.json](evidence/C004-dashboard-transfers.json)|`65a9c5c432455d097cd6d4a47ff7c9e7f824e79e6fc3a602a623696ce27fca63`|
|[evidence/C004-DASH-001.json](evidence/C004-DASH-001.json)|`d3dfb8c2cbab173e040a3288470200fc4cdd2bf4f921e172cc5ab2df7301ccf6`|

## C005 additions

| Path | SHA-256 |
|---|---|
|[checkpoints/C005.md](checkpoints/C005.md)|`8c99f3967beca72de8b526b9ddafa49a841d001ca3d1bbf4c95b19661b6388aa`|
|[checkpoints/C005-coverage-summary.json](checkpoints/C005-coverage-summary.json)|`d41d241c09d1d69a16ee5a6aec11d2e6b93e04fec2c03366ded997c16dfd243f`|
|[checkpoints/C005-review-records.json](checkpoints/C005-review-records.json)|`0881ef4d907356ba356304e7ba02fad1ff32a575b5147c34f495a73bb919b527`|
|[checkpoints/C005-pending-files.json](checkpoints/C005-pending-files.json)|`37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`|
|[evidence/C005-C004-dashboard-transfers.json](evidence/C005-C004-dashboard-transfers.json)|`6eabadfd1f9b10d8428cd0bf3faff3bd7290c2c2728bd02cbd588de5e969c7aa`|
|[evidence/C005-C004-database-transfers.json](evidence/C005-C004-database-transfers.json)|`945c3341386cd1a0574ffeb7cda77d4f36e0d96b92917b2cc579db42f238b89f`|

## C006 additions

| Path | SHA-256 |
|---|---|
|[checkpoints/C006.md](checkpoints/C006.md)|`2a7e25e400b619dd571f1d26c4dafc841da18fd39ae78607a6f3779be958f481`|
|[checkpoints/C006-coverage-summary.json](checkpoints/C006-coverage-summary.json)|`ebe8622b74c35d314aacaa203f3dc3fe0defe4c26ec18f2ea85ed3bfbdcb6c97`|
|[checkpoints/C006-review-records.json](checkpoints/C006-review-records.json)|`09488fc33f990f16addbefef110686996115996b42c34b040491c506a9b0c1ed`|
|[checkpoints/C006-assignment-roster.json](checkpoints/C006-assignment-roster.json)|`66422377763c89aa06894e2a734c3e2be06c66aa4ace8e9f1914679e1cc8869c`|
|[evidence/C006-DASH-001.json](evidence/C006-DASH-001.json)|`cb68b4004ad5d035c24fad51400d4fb1aac6c84bbdaa83e7cf814063ba6707d4`|
|[evidence/C006-dashboard.json](evidence/C006-dashboard.json)|`b9b2164441d8a6c8bf60c0b32592391e435c0541215971bb0033aa882e4de233`|
|[evidence/C006-database.json](evidence/C006-database.json)|`347b50bb2e6931bf5b852f4ba25250d18f0ba574bae21e97c6d23cf37b576c78`|
|[evidence/C006-prime.json](evidence/C006-prime.json)|`b9cc000ad03d43e4107c32bff259006c92bc61912e953516eb59a28220398c0b`|

## C007 additions

| Path | SHA-256 |
|---|---|
|[checkpoints/C007.md](checkpoints/C007.md)|`4d2e6b62dbce5a4ce9ce856eed7ac41eaefa59e3dc20f41e9f1d07b69341d506`|
|[checkpoints/C007-assignment-roster.json](checkpoints/C007-assignment-roster.json)|`1c7f2dec16fc7cbd538977b6a3f74bf47de3bd70b89c44c0deacacf6632969b4`|
|[checkpoints/C007-ownership-transfers.json](checkpoints/C007-ownership-transfers.json)|`6ab7187ac0fea3ab43ee95a5e00c1288bdb718429cb592603044bd32029018ce`|
|[checkpoints/C007-review-records.json](checkpoints/C007-review-records.json)|`b6ad8dbcd57f480f5b8d3c5fab97fc735f934d81d91d6789abb99b3e802b2c91`|
|[checkpoints/C007-pending-files.json](checkpoints/C007-pending-files.json)|`37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`|
|[checkpoints/C007-coverage-summary.json](checkpoints/C007-coverage-summary.json)|`3971981e3c67b81de66e1efdfa3813b23741dd4cfaf1e57bdabbf6fb8120c4e6`|
|[checkpoints/C007-execution-status.json](checkpoints/C007-execution-status.json)|`fb16d43c9d0c8413653aaf63f7909089a2687ed79dbbd629f5c404b4034a1bc2`|
|[evidence/C007-dashboard-results.json](evidence/C007-dashboard-results.json)|`80563407f1f2468c48832e7fd69a0be224bc6befce0d3cfca97387e2e1670162`|
|[evidence/C007-customer-results.json](evidence/C007-customer-results.json)|`57e9fb1504df29c733d349fd0684522456da459dec0c6e76aec2f903f35a80a8`|
|[evidence/C007-dashboard-transfers.json](evidence/C007-dashboard-transfers.json)|`7f3411477ebc9e3993310f57f51c18bc7e4b947cbabca06558f8837b90936a0f`|
|[evidence/C007-customer-transfers.json](evidence/C007-customer-transfers.json)|`1677b686f30870fbc4b3d04642130113324830e28a733e4bd7bbba10bf0ff783`|

## RB-001 additions (new immutable main source)

| Path | SHA-256 |
|---|---|
|[checkpoints/REBASELINE-2c181fc3.md](checkpoints/REBASELINE-2c181fc3.md)|`37c7c7474f75da1194a59e433eb96a8498bc01e2ce2b1c3d2c5758a0c34e50fe`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/README.md](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/README.md)|`f2e6a78ff276376470d5507565d519b4bb3e28556705fade13b928ac4d526c26`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/cross-feature-impact.md](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/cross-feature-impact.md)|`6d7ec59a1ce88fdeff979ed1aa66c8ef372aefbb36690c0289a0aae2a25ded8c`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/summary.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/summary.json)|`9206e4a3e920afc0c9285e9c985cfca2e2d82c07c817c3f108abc662df8f23a1`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/git-diff-inventory.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/git-diff-inventory.json)|`4ca5ef5559a1973edbed5184cfaf386a8d7a438324acb0f5ffbc0e39457e53f0`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/current-coverage-ledger.csv](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/current-coverage-ledger.csv)|`c8d456a7344e56e4464ce5842e41cbb2a3416d3c6be40f14c62deb25b0c2e1b5`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/current-remaining-files.txt](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/current-remaining-files.txt)|`034a9c829525850fbc24ab766b7f2af80c2b3bf0c276ddec5559ec4609f275f3`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/reusable-published-reviews.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/reusable-published-reviews.json)|`67c54073a731bf3e7b31834ef728b158ea05a7eb7108284cc1a1e0382ec2a347`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/invalidated-published-reviews.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/invalidated-published-reviews.json)|`3ca90a5ecf2784ba70652fb841127467bd6d0da6d7343a575fb17f9dc7f69d17`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/new-source-candidates.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/new-source-candidates.json)|`504853781df9f338e026f6a820ebe6fc31f17e76679c5fbabb078d6969696370`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/recovered-provisional-evidence.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/recovered-provisional-evidence.json)|`c548798eaafa9af27fee27dc1f587050a6a2816baf3834a521759b2ae6fce1f1`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/historical-removed-files.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/historical-removed-files.json)|`37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/input-file-hashes.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/input-file-hashes.json)|`71e03c64384539770ca24d88137f4a7b7ab8422ecbc2bc267b17a0196a6e601d`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/targeted-dependency-impacts.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/targeted-dependency-impacts.json)|`b1dc727c7cd2ab9a508559e72991b421bd7697772c32e0620df0429b21fff48d`|
|[rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/verification.json](rebaselines/2c181fc3a92808ebd0834b6d2e4f66ccc2c588a8/verification.json)|`e19533d8cdc1971e3cd103e4058a9a263e29be925d7db557a2e63fcc95ff999b`|

## D001 current-main semantic review and finding

| Path | SHA-256 |
|---|---|
|[checkpoints/D001-2c181fc3-review-records.json](checkpoints/D001-2c181fc3-review-records.json)|`e93f3def002c662345b846c86d74bb9f0f15ea32f24feffe9442a46f8b1214e1`|
|[checkpoints/D001-2c181fc3-coverage-summary.json](checkpoints/D001-2c181fc3-coverage-summary.json)|`4184434ab46db0f8cc2f498d73761079c720f1a3e088be06b0439667804379fc`|
|[checkpoints/D001-2c181fc3-current-ledger.csv](checkpoints/D001-2c181fc3-current-ledger.csv)|`8c6197b4b22c40411e2bb40289a062dc8c9969eb144aece3388cfd246f7f21bf`|
|[checkpoints/D001-2c181fc3-current-remaining.txt](checkpoints/D001-2c181fc3-current-remaining.txt)|`6bf4a03b3f3c236a4c885e977a9bc1e1697875ee30583dd10f50ee3e49ce7055`|
|[checkpoints/D001-2c181fc3.md](checkpoints/D001-2c181fc3.md)|`130b30a04195198d0a2a02af317145485efa5cb66fac2d2f77a7cc2420e254f0`|
|[findings/RB001-OBS-001.md](findings/RB001-OBS-001.md)|`8e169772e44eaac6a74b5351c7661fd10f9b1f3ffcc85018c6877fa7ce074c1a`|

## C008 current-main completed batch

| Path | SHA-256 |
|---|---|
|[checkpoints/C008-2c181fc3-review-records.json](checkpoints/C008-2c181fc3-review-records.json)|`7292eb198937cf8bf523ea6ff55792bfc778390eb2defe63a5408047d64a50f0`|
|[checkpoints/C008-2c181fc3-assignment-roster.json](checkpoints/C008-2c181fc3-assignment-roster.json)|`e617b1d3c5912097f258ec8bb225a59e3da97c09d7a2251f67fa1904ad4fc9de`|
|[checkpoints/C008-2c181fc3-ownership-transfers.json](checkpoints/C008-2c181fc3-ownership-transfers.json)|`bd3777e0eff62e8bfe203d9add40dacf67fd92c3ea23483e9d816e9a30b566a2`|
|[checkpoints/C008-2c181fc3-coverage-summary.json](checkpoints/C008-2c181fc3-coverage-summary.json)|`39cd83bebfc1a1228fc6326e31aeac1f5a51e5e6a5eb786a6a77c766487e4d37`|
|[checkpoints/C008-2c181fc3-current-ledger.csv](checkpoints/C008-2c181fc3-current-ledger.csv)|`11085a910212aafce07871662fe0e60c5ed7f9fbbe9f311800883b10f71c0f5a`|
|[checkpoints/C008-2c181fc3-current-remaining.txt](checkpoints/C008-2c181fc3-current-remaining.txt)|`0909fecdf65713e2c4fb88076266b442e6abb8476d1aaee0051da8f8f56bab96`|
|[checkpoints/C008-2c181fc3.md](checkpoints/C008-2c181fc3.md)|`c5fa187d32b681c203931621d2568fe6838a696f8d8a4a504b1a1636fe9a5a36`|
