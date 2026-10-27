# Continuation evidence manifest

All entries are sanitized text artifacts. SHA-256 hashes cover exact bytes. This manifest excludes its own hash; Git commit supplies its integrity anchor. Original evidence-manifest.md and coverage-ledger.csv remain unchanged in the parent audit directory.

Evidence mapping: SEC-011 → FINDINGS_REGISTER, FINDING_VALIDATION, security saved review records and actual-service model script/output. File coverage → progress CSV, C001 review records/assignments/summary and original ownership inventory. Rejections/open hypotheses → FALSE_POSITIVE_DISPOSITIONS, coordinator review records. Feature/runtime limits → FEATURE_COVERAGE, CROSS_FEATURE_RISKS, TEST_EVIDENCE and SECURITY_COVERAGE. Frozen source paths/hashes are embedded in assignments/results and model output; source code is linked at exact baseline instead of duplicating repository files.

Intentionally excluded: original raw VAYLET_AUDIT_EVIDENCE.zip (not republished; prior sanitized extraction remains available); local helper/cache/bytecode files (implementation scaffolding, not review evidence); unsaved worker reads and absent final reports (cannot substantiate full review); real environment files, machine configuration, credentials/cookies, provider/production logs, database dumps, screenshots and private network details (unneeded and unsafe to publish). No new screenshots or production/customer data were collected. Model-generated keys/seeds/codes remain in memory and are never printed. Existing repository test credential strings are not copied into evidence.

No evidence archive, Git LFS, dependency installation or size-limit bypass. New evidence comprises worker semantic notes and a small synthetic source-model reproduction, whose substitutions/limits are explicit. Secrets review inspected all new text; pattern screening is supplemental, not a claim to prove the absence of every possible secret.

| Path | SHA-256 |
|---|---|
|[AUDIT_PROGRESS.md](AUDIT_PROGRESS.md)|`6b19419209ab4f988ebffc50be7a0ec1a29395b8a547f22765cc9a4a2dfe238b`|
|[CHECKPOINTS.md](CHECKPOINTS.md)|`ba6a97db2f47851e6519b01c5fc4e1791d61f8da37cd022751ea962a2fe668b8`|
|[CROSS_FEATURE_RISKS.md](CROSS_FEATURE_RISKS.md)|`c467f173e8bfad3084710565b31e051bf4a966da71155e271da1eff0a7a3ce16`|
|[FALSE_POSITIVE_DISPOSITIONS.md](FALSE_POSITIVE_DISPOSITIONS.md)|`c292f9ebb470be6bb36a18c0fcaf5efc7d86920d1bf881ef8e0f7852baff5677`|
|[FEATURE_COVERAGE.md](FEATURE_COVERAGE.md)|`587976b1cd2868f7f3a88a1d76e30307781c04e7dea2b211a36d033bcaf6ccf4`|
|[FINDINGS_REGISTER.md](FINDINGS_REGISTER.md)|`91634c4e995429b91e259c1b2750267ffb1fa84cc4cec41483236f6084f9103b`|
|[FINDING_VALIDATION.md](FINDING_VALIDATION.md)|`06de048272943775acd84305b0c23122e5d867640176b18d3abf76e955df1cf1`|
|[README.md](README.md)|`1e8c1f4f6e6fad421417fd1ee900afc96ab73f34d7fe591d1073bddf88d5f182`|
|[SECURITY_COVERAGE.md](SECURITY_COVERAGE.md)|`65e94188a7aff9e076539cac38aa1ceafcdeb7b004b452d001f12ef0c8cbdae9`|
|[TEST_EVIDENCE.md](TEST_EVIDENCE.md)|`e376d261642d344d8700c9c0d82c1c5ca412efc63b9682a9f0d05238c7c0de2a`|
|[checkpoints/C001-assignments.json](checkpoints/C001-assignments.json)|`01b5e193f8ce4d782e3e1080c1548efd554dc66342f54e2c3ebc541d817d9e9a`|
|[checkpoints/C001-coverage-summary.json](checkpoints/C001-coverage-summary.json)|`2a268b1a55db35335cc1a6d5f6488b66426d397ede4e79f3d2d06278d45cf99b`|
|[checkpoints/C001-pending-files.txt](checkpoints/C001-pending-files.txt)|`46b8e0c75777785eafecb40b2ace46498dbbbb88b24d6185bf824a273271d2fb`|
|[checkpoints/C001-review-records.json](checkpoints/C001-review-records.json)|`f8bd33299bad029a32e74216e6410adccc7d3fef19784a3b097f2be9edc1100a`|
|[checkpoints/C001-starting-plan.json](checkpoints/C001-starting-plan.json)|`b720e961d38219dc37a824f1544dedf734dc3cf23de5d96f5e89ffc2a9c53be3`|
|[checkpoints/C001.md](checkpoints/C001.md)|`551fb92ff48dea356b2e3b429572afa1f96ac210ad795d536cd203b521cb7b81`|
|[checkpoints/initial-remaining-ownership.json](checkpoints/initial-remaining-ownership.json)|`6a074f7595eaee2f81871527096f9bf4e141b1de5d2da2e0124897bb7bf05976`|
|[coverage-ledger-progress.csv](coverage-ledger-progress.csv)|`f200fe8faec09db7c25cf21336a7d0705e8cf08f836542aaecd0d6b54693de4b`|
|[evidence/C001-backend_operations-saved-results.json](evidence/C001-backend_operations-saved-results.json)|`f821e43cd83b2fcd4cd51a29deac4fa17f26d74b4091034c40e4afb8202bf97d`|
|[evidence/C001-coordinator-saved-results.json](evidence/C001-coordinator-saved-results.json)|`c4e71aa94b824c60ac56db4da66f6aab25b95c75cef7177c5be02a83ae3ca8e3`|
|[evidence/C001-customer-saved-results.json](evidence/C001-customer-saved-results.json)|`347ff3aa7f1ac540e588b07eed30b33d326d5bd6373cef661f25c4faa0538048`|
|[evidence/C001-dashboard-saved-results.json](evidence/C001-dashboard-saved-results.json)|`3c12c5667444b79f06f4b3f807db723a2693ffa3300a2932a5336cbeac167407`|
|[evidence/C001-database-saved-results.json](evidence/C001-database-saved-results.json)|`aed6134553b46e7a2807cecfd1c64f823d38f0906e08eb0dc2341a8602cca67a`|
|[evidence/C001-native-saved-results.json](evidence/C001-native-saved-results.json)|`5fc4e72d0605bef9301b13d289cde83f35136be3fe8a2c8c6f1a1df4fa7f52c2`|
|[evidence/C001-security-saved-results.json](evidence/C001-security-saved-results.json)|`92f5dbf89fda7a1c1f907119f22a1e61ba6a9b455f7e36e07de0d0e63572c4fe`|
|[evidence/mfa-recovery-session-model.cjs](evidence/mfa-recovery-session-model.cjs)|`586e58d79509a4dd255d277e217f553c2d4b43f469cca4625d7dc0fd01af44e8`|
|[evidence/mfa-recovery-session-model.txt](evidence/mfa-recovery-session-model.txt)|`d555d6fec32b0b3641beec480152cab77add08668cbcacfae998409635e20914`|
|[remaining-files.txt](remaining-files.txt)|`97a9aa8973bc6493cb0304d758aa1da9f8201e283ab36180ec1527c819fda004`|
