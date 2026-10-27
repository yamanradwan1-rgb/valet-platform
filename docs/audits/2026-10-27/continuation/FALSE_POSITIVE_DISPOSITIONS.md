# Rejected candidates and open hypotheses

| Candidate | Disposition | Reason/evidence |
|---|---|---|
|Read ACTIVE factor secret through enrollment.begin|FALSE POSITIVE for that state|Explicit ACTIVE rejection; synthetic control passes. SEC-011 is narrowed to recovery-created PENDING.|
|Read a different user's current MFA factor|FALSE POSITIVE for inspected path|User-scoped query and secret AAD; different-user model obtains separate factor.|
|Recovery immediately assures every session|FALSE POSITIVE|Recovery inserts pending without establishing assurance. Attacker confirmation is separate SEC-011 step.|
|Digital collection callback-first response conflict implies duplicate charge|INTENDED BEHAVIOR in reviewed path|CAS and transaction rollback preserve canonical finance; unknown outcome not blindly redispatched. Real provider qualification missing.|
|Dashboard security refresh .then rejection leaks ordinary network errors|FALSE POSITIVE in inspected provider path|refreshState returns an error snapshot; retained shell presentation is not route authority.|
|Customer visual fixture proves provider correctness|ENVIRONMENT LIMITATION|Visual mocks cannot qualify auth/provider behavior; no new product defect asserted.|
|HYP-C001-01 simultaneous stale cluster-owner reclaim|NEEDS INVESTIGATION|ownership-state.mjs reads old owner then unlinks without conditional compare. Cross-process contention schedule and practical damage need filesystem-only reproduction; no confirmed resource deletion claimed.|
|HYP-C001-02 journal append fails after child spawn|NEEDS INVESTIGATION|command-runner/runtime spawns before journaling; recovery of disk-error child needs targeted proof. No reproduced orphan/leak claimed.|

No duplicate of original ten findings is added. Missing mounted-store/browser/SQL/provider tests are disclosed limits, not automatically new bugs.
