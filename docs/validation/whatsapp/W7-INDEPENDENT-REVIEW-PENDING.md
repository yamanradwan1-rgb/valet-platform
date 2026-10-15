# WA-W7 — Independent acceptance ledger

The assigned worker-7 chat failed to open and cannot be revived by the current connector (reported `failed; revivable=false`). Its isolated worktree still exists. Prime authored the W7 guard and tests there to maintain the strongest available progress. **No independent final acceptance verdict has been received.**

Initial guard checks original pinned 2174-file UI manifest and rejects changes/new files under Native, Employee, Customer, shared UI, snapshots and unrelated Dashboard. The exception is exact `settings-page.tsx` plus new `whatsapp-*` siblings and new scoped compatibility tests; manifest remains immutable. Run on the merged SHA:

```text
node --test scripts/whatsapp-ui-freeze-guard.test.mjs
node scripts/whatsapp-ui-freeze-guard.mjs
```

Final F01–F45 acceptance classification is **NOT RUN** until cumulative source, fixture and independent review are present. Test passes in the guard alone do not satisfy full functional, PostgreSQL, role, crash, physical or provider proof. Independent W7 GO/FIX report is BLOCKED by worker-chat startup and must not be manufactured.
