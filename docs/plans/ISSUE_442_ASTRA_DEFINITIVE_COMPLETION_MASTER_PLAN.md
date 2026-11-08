# Issue #442 — Astra completion master plan

Status: **DECISION REQUIRED — proposed execution plan; Gate A remains closed.**

Date: 2026-11-08. Planning and documentation only. This document neither accepts DEC-112 nor authorizes production implementation. The owner's later instruction requests English and no supporting reviewers; this review was performed by one agent. No independent-review approval is claimed.

## 1. Repository facts discovered

- Repository: `yamanradwan1-rgb/valet-platform`.
- Existing worktree: `D:/kndoom/valet-platform/tmp/issue-442`.
- Existing branch: `fix/issue-442-retrieval-cancel-state`.
- Reviewed tracked HEAD: `cded4e5ec5fed591f321ec983a5e2d46d0f66554`.
- Local HEAD and remote feature HEAD matched after fetching the feature branch and main. No merge, rebase, checkout or branch creation was performed.
- The three existing Issue #442 planning documents have local modifications. DEC-112 is untracked. `tmp/u003/` contains ignored investigation material. None belongs in this plan commit.
- The supplied brief is older than the current local investigation. Its H1–H3 failures and 16 deadline passes are historical checkpoints, not the latest reported state.
- No shipping Outcome GET or five-message implementation was established by this review.

The source baseline is therefore **tracked HEAD plus explicitly identified local evidence**, not a reproducible committed implementation of the prototype. Downstream COS must fingerprint the candidate and its test inventory before using prior results. Do not commit those local assets merely to make this document reproducible.

## 2. Executive verdict and business objective

Complete the five approved explanations in the existing Employee Native Retrieval recovery screen. Preserve physical custody, secure handoff, current authority and the UI freeze.

**Primary recommendation:** a purpose-bound, single-final-transaction variant of hardened Read C. Retain exact credential/current-scope fencing and canonical exact-Task evidence. Move all avoidable asynchronous response preparation before the protected read. Perform the full authorization and history proof once, close to response handoff; validate the tiny response and recheck credential time under the same transaction, commit successfully, then apply the agreed lease/abort checks at the actual HTTP boundary.

This is a recommendation to qualify, not a claim that the current three-transaction prototype already implements it. The single-transaction variant must pass the same negative and concurrency tests before replacing the current candidate.

**Practical fallback:** retain two full protected reads when the actual NestJS path contains unavoidable asynchronous work between initial proof and response preparation. The second read must repeat authority and proof, not just credentials. Do not add an unbounded sequence of increasingly late checks. Two reads have the same fundamental post-final-COMMIT policy requirement as one.

An immutable outcome table is not the first choice: it changes writers, schema, deployment and provenance while leaving current-authority and response-release races unresolved. Reduced legacy coverage is acceptable only where evidence is genuinely insufficient; it must not silently remove an approved message or conceal a fixable normal-flow defect.

Largest trade-off: preserving all-scope authorization and complete version evidence costs more than a current-state lookup. Removing redundant transactions is a defensible optimization; removing historical entitlement or insertion fencing is not.

## 3. Binding requirements

Exactly these cases are in scope:

| Case | Arabic | English intent | Source |
| --- | --- | --- | --- |
| 1 | الضيف ألغى طلب الاسترجاع | Guest cancelled retrieval | Canonical server proof |
| 2 | تم استلام المهمة من موظف آخر | Another employee took the task | Direct committed transfer proof |
| 4 | تم إكمال المهمة بالفعل | Task already completed | Terminal release proof |
| 7 | مشكلة في الاتصال بالإنترنت | Internet connection problem | Confirmed device offline |
| 8 | تعذر التحقق من حالة المهمة | Unable to verify task state | Safe neutral fallback |

No new permission, background polling, command replay, positive category, state transition, setting or custody behavior. This is existing MVP Retrieval work. There is no Company-default/Location-override configuration change.

Entities read: User, StaffAuthSession, OrganizationMembership, Organization, Location, MembershipLocationAccess, Shift, Task, ValetSession, RetrievalRequest, DispatchEvent, AuditEvent and terminal KeyCustodyEvent. The reader changes none of them. Existing writer transitions are evidence, not new commands.

## 4. Current implementation and evidence register

| Evidence | Classification | What this review establishes |
| --- | --- | --- |
| [GitHub Issue #442](https://github.com/yamanradwan1-rgb/valet-platform/issues/442) | Current issue, fetched | Reported guest-cancel trigger; screenshot does not establish disconnection |
| `ISSUE_442_RETRIEVAL_OUTCOME_REASONS_IMPLEMENTATION_PLAN.md` | Committed document plus local additions | U-001/U-002 and conditional endpoint purpose; latest local claims supersede older narrative |
| `ISSUE_442_U003_SECURITY_QUALIFICATION.md` | Existing investigation document | Initial candidates were rejected; not evidence of shipping-route behavior |
| `ISSUE_442_U003_SECURITY_REMEDIATION.md` | Existing investigation document | Read C development and separate writer fixes; not Gate A approval |
| `tmp/u003/gate-a-targeted-final-regression.log` | Retained executed-run log, inspected | 24 files, 92 tests passed; cleanup db/roles/children zero; includes defect/policy witnesses |
| `tmp/u003/GATE_A_2026-11-08_falsification_checkpoint.md` | Historical report, inspected | Initial actor, post-COMMIT and scope falsifications; source-only reviewer opinions separately identified |
| `tmp/u003/GATE_A_2026-11-08_targeted_remediation_checkpoint.md` | Historical report, inspected | Corrections, separate test invocations and writer regression claims |
| `tmp/u003/proof-hardened.sql` | Current ignored source, inspected | Version ordering, owner-pair disambiguation and exact Task/Request selectors now present |
| `tmp/u003/scope-nowait-candidate.ts` | Current ignored source, inspected | User advisory, credential lock, all known Membership/scope locks, exact target lookup |
| `tmp/u003/deadline-candidate.ts` and `deadline-lease-cleanup.ts` | Current ignored source, inspected | Bounded driver wrappers, two full reads plus a third credential transaction, cleanup outside positive budget |
| `tmp/u003/u003-p2-historical-precision-falsifier.test.ts` | Test definition, inspected | H1 uses real Accept/Cancel commands; H2/H3 deliberately use privileged synthetic histories |
| Latest local document additions | Reported results, not independently rerun | 21 deadline tests, 6 writer-order tests, 12 historical tests, then 15 focused historical tests including aliases |
| DEC-108 | Accepted focused decision, read | Narrow LocationAccess in-flight allowance, unchanged credential rules |
| DEC-107 | Proposed focused decision, status inspected | Owner-approved sub-policies do not make the whole DEC Accepted |
| Local DEC-112 | Proposed focused decision, read | Sixteen revocation rows, 2,000/150-ms targets, explicit unresolved exceptions |

No PostgreSQL test was executed in this documentation task. No remote CI result or physical-device result is claimed. Existing reports are not independent runtime verification by this author. The 92-test log does not establish that subsequent SQL/deadline edits passed those same 92 cases.

Review coverage is bounded: production Accept, cancellation, mutation/history recording, completion Audit, Emergency lock/command, nearest controller/module, Native panel/copy and client reconciliation were inspected directly. Some large document reads were truncated; complete governance, schema/migration, all writer and all HTTP-runtime coverage has **not** been established. This is a material limitation on a definitive Gate A approval, recorded rather than hidden. Section 25 assigns the remaining exact-source verification; no new broad architecture exploration is needed.

## 5. Previous fixes to preserve

1. `3fd6bab978e2b955068de3bcaf49b741d7a16f95`: Emergency obtains persisted Location lifecycle protection before Staff credential and Task locks.
2. `ad2df4431ce6a4e11d0459f2911c238a0714068a`: Emergency physical Session uses `FOR NO KEY UPDATE`, preserving compatibility with Audit foreign-key key-share acquisition.

Directly inspected `emergency-takeover-command.ts` and `emergency-takeover-locks.ts` retain these changes. Preserve the exact source and tracked regression suites. Never revert either to simplify the reader. A new reader cycle is in scope; a hypothetical unrelated writer cycle is a separate finding until reproduced and ranked.

## 6. Locked decisions

| ID | Atomic proposition | Classification | Basis |
| --- | --- | --- | --- |
| L1 | Only the five approved messages may be added | LOCKED | Owner assignment |
| L2 | Historical entitlement belongs to the original exact Membership/Task relation | LOCKED | U-001 |
| L3 | Current eligible authority is also required, including one usable scope | LOCKED | U-001/U-003 |
| L4 | Transfer means a direct qualifying viewer-to-current-owner transfer on the original live Task | LOCKED | U-002 |
| L5 | LocationAccess has a narrow bounded in-flight allowance | LOCKED | Accepted DEC-108 |
| L6 | DEC-112 is not Accepted and cannot be committed here | LOCKED | Owner assignment and local status |
| L7 | Existing deadlock fixes and UI design must remain intact | LOCKED | Owner assignment |
| L8 | Only this new plan may be committed in this task | LOCKED | Owner assignment |

## 7. Derived conclusions

| ID | Atomic proposition | Classification | Evidence and falsifier check |
| --- | --- | --- | --- |
| D1 | Global timestamp order is unsuitable for Task causality | DERIVED | Accept uses post-lock time; cancellation uses transaction time; H1 test explicitly schedules inversion |
| D2 | Another protected transaction cannot eliminate the final database/HTTP gap | DERIVED | Candidate commits before handing off; DEC-112 explicitly records the residual |
| D3 | State-only reads cannot establish U-001/U-002 | DERIVED | Current owner/status omit former holder and direct-transfer chain |
| D4 | The latest ignored proof differs materially from the brief | DERIVED | Current SQL contains H1/H2/H3 corrections and alias validation |

Falsification coverage: **4/4 DERIVED conclusions checked against the named immediate falsifiers**. This is not a claim that every repository contract or race was verified. L1–L8 are transcribed owner/decision constraints; full cross-document contradiction checking remains a prerequisite in P0.

## 8. Unresolved decisions

Retain existing U-001/U-002/U-003 numbering. Use subordinate IDs rather than redefine their meanings.

| ID | Unresolved choice | Recommendation | Consequence if rejected |
| --- | --- | --- | --- |
| U-003-R | Revocation classes permitted after final proof | Explicit short in-flight permission for operational scope/Task changes; explicit treatment of credential/security changes | Positive release remains blocked for any class requiring suppression without an enforceable mechanism |
| U-003-T | Total and post-proof budgets | Start qualification at 2,000 ms total and 150 ms from final protected proof to application handoff | Re-measure; never silently lengthen exposure |
| U-003-X | Transaction simplification | Qualify one final full protected read; retain two-read fallback | Retain existing candidate structure while bounding all phases |
| U-003-H | Negative transport distinctions | Concealed 404 for unknown/unauthorized/unproven target; 401 auth loss; controlled 503 for resource failure | Keep exact mapping proposed until contract review |
| U-003-E | Emergency historical transfer coverage | Support only after exact Emergency writer/version/receipt proof qualifies | Explicit neutral on unsupported history; approval needed if this excludes a required ordinary case |

Concrete recommendations below are conditional on these decisions and Gate A. They are not Accepted policy or authorization to implement today.

## 9. Independent critique of the accumulated approach

Security-essential: exact identity, present authority, one eligible scope, original Membership relationship, terminal/direct-transfer evidence, fail-closed ambiguity, transaction/lease ownership and output fencing.

Required by accepted/owner contracts: U-001/U-002, fresh authority, no replay, terminal precedence, narrow DEC-108 interpretation, existing credential rules and UI freeze.

Justified by reproduced observations: Staff actor provenance, eligible rather than raw active-scope counting, Task-version chronology, scoped Audit selection, nonblocking reader contention, uncertain-transaction disposal.

Potentially redundant: first complete proof followed immediately by an identical proof and another credential-only transaction. Extra transactions add pool tenure, failure paths and recheck disagreement; they do not create stronger final-byte guarantees.

Do not remove all-Membership protection merely because the target is at one Location. The predicate is exactly one eligible scope for the User, so another Membership becoming eligible matters. Locking existing rows alone does not protect missing rows. Audit actual insertion/activation writers and their parent/advisory fences.

Keep complete exact-Task reconstruction initially because it is the implemented evidence model. Replace it with a smaller witness only after proving equivalent rejection of conflicting later edges, transfer-back and fabricated relationships. No repository-wide event framework, egress gateway or projection system is justified solely by this feature.

## 10. Architecture alternatives and decision matrix

Ratings are engineering assessment, not benchmark results. A = hardened Read C; B = state-only/minimal authoritative read; C = immutable purpose-specific evidence; D = provable-history delivery with neutral legacy fallback.

| Criterion | A | B | C | D |
| --- | --- | --- | --- | --- |
| Authorization correctness | Can satisfy with full fences | Current-state subset insufficient | Still needs A-like current authority | Same current authority as A |
| Historical accuracy | Good where chain uniquely proves truth | Cannot prove former holder/direct edge | Strong prospectively; legacy unresolved | Explicitly limited to provable cases |
| Tenant isolation | Exact persisted scope | Possible, insufficient for history | Composite scope integrity required | Same as A |
| Revocation races | Policy + final protected point | Same fundamental gap | Same fundamental gap | Same fundamental gap |
| Deadlock risk | NOWAIT aborts reader waits; audit hidden waits | Fewer locks but weaker guarantee | Adds writer/FK interactions | Same reader mechanism |
| Latency | More work; reducible repeated proofs | Lowest but unacceptable contract | Cheap read, added writer cost | Bounded proof/fallback |
| DB workload | Scope locks + exact history | Small | Write amplification/storage | Bounded existing workload |
| Schema change | None appears necessary | None | Required | None appears necessary |
| Backend complexity | Moderate/high, local | Low but incomplete | High implementation breadth | Moderate |
| Migration complexity | None currently justified | None | New constraints, grants, deployment | No speculative backfill |
| Reuse | High | High for current state only | Partial | High |
| Regression risk | Reader containment possible | Disclosure/correctness risk | Many domain writers touched | False-neutral coverage risk |
| Native complexity | One reason enum | Cannot deliver approved truth | Same enum | Same enum |
| Maintainability | Focused modules and proof contract | Simple but wrong scope | New permanent source of truth | Explicit legacy limits |
| Observability | Stage timings and result classes | Easy but semantically incomplete | Reconciliation/projection health | Track neutral coverage |
| Testability | Existing fixtures reusable | Easy positives miss history | Atomic writer + migration tests | Coverage inventory required |
| Ability to finish | Best supported | Reject as primary | Reserve for demonstrated data deficiency | Useful compatibility strategy |

Option D is a coverage rule inside A, not permission to delete cases 1, 2 or 4. Reject B unless it retains sufficient historical evidence, at which point it is a simplification of A rather than a state-only design.

## 11. Selected primary architecture

Conditional on U-003-R/T/X/H: follow the existing thin-controller to explicit-query pattern. A dedicated query owns one acquired connection and one final protected transaction. It returns an internal discriminated result, not an authorization token. No generic repository layer or self-HTTP call is necessary.

Prepare request validation and fixed response representations before protected work. Authenticate using the existing resolver under the admission deadline. Under the final transaction acquire the qualified fences, derive the only eligible scope, lock the exact target, execute canonical proof and recheck time-dependent credentials. Validate/select the reason-only payload while locks remain held. Successful COMMIT is mandatory; uncertainty means no positive.

At the real last preventable HTTP handoff, synchronously enforce the remaining overall budget, proof lease, abort flag and accepted late-security rule. No awaited business work after COMMIT. An operation observer or interceptor that adds an asynchronous gap must be moved before final proof, bounded, or handled by the fallback.

## 12. Practical fallback and migration consequences

If measured HTTP sequencing prevents one final transaction from being placed near handoff, use the two-full-read candidate with one admission deadline. A changed result between reads produces neutral, not a fabricated compromise. The final read owns the release authority. A third credential query is useful only if required by the accepted credential contract; it must not be described as scope revalidation.

Switch once, based on a demonstrated placement or safety failure. Do not oscillate between designs without new evidence. If both cannot satisfy the release policy, stop positive delivery and resolve that policy; neither schema redesign nor additional reads fixes it.

No migration appears necessary under the recommended existing-evidence design. That is not a guaranteed zero-migration conclusion: an approved index addition or fallback C would require schema documentation, a new migration and migration tests. Do not edit historical migrations.

Option C becomes justified only if required production histories cannot be uniquely proven from canonical fields, or bounded exact-history queries miss the agreed workload budget after targeted tuning. A proposed immutable record would need exact Organization/Location/Task/Request, Task version, actor/previous/new holder and operation correlation, atomically written by every relevant writer. No asynchronous projection may grant entitlement before authoritative commit. No guessed backfill; legacy gaps stay neutral. Old writers must not be treated as emitting new evidence during mixed deployments. Obtain owner acceptance before defining a table or expanding writer scope.

## 13. Canonical historical proof contract

| Proof component | Positive requirement | Neutral / reject condition |
| --- | --- | --- |
| Target | Exact RETRIEVAL Task, persisted Organization/Location/Session | Unknown, foreign, wrong type or mismatch |
| Request | Exactly attributable original Request; Task creation/request time plus canonical Task/Request references agree | Zero/multiple candidates, missing required reference or conflicting aliases |
| Historical holder | Original Membership received Assignment, accepted as holder, or permitted direct transfer on this Task | Same User with different Membership; queue presence only |
| Staff provenance | Nonnull Staff actor with canonical event/entity and paired actor consistency | Missing actor, explicit non-Staff provenance; do not equate actor with recipient for supervisor assignment |
| Legacy actor type | Nullable legacy provenance only where migration/writer history supports it and nonnull Staff identity is coherent | Null identity or unsupported provenance inference |
| Version chain | Unique contiguous Task version edges, matching statuses/owner flow, final version equals persisted Task | Duplicate version, gap, conflicting owner/status, extra exact-Task malformed evidence |
| Pairing | Exact Task scope, event kind, shared operation timestamp and required actor/owner fields; one-to-one | Multiple plausible pairs, reused Audit row or unpaired required event |
| Guest cancellation | Exact CANCELLED Task and Request; GUEST cancellation Audit, version edge, preserved prior holder | Current PARKED Session alone, sibling cancellation, missing exact Request |
| Direct transfer | Viewer is previous holder in latest qualifying ownership edge to different current holder; Task live | Initial assignment, decline then assignment, indirect A→B→C for A, transfer-back, unrelated Emergency |
| Completion | Exact Task/Request completed and canonical Session completion plus vehicle-release/key-custody evidence | READY or HANDOFF_PENDING, completion from another Task, missing release |
| Precedence | Proven terminal result takes precedence over older transfer | Contradictory terminal histories remain neutral |
| Siblings | Different Task/Request events do not join this proof | Exact-Task malformed row still invalidates proof; do not hide it by filtering only valid types |

Never infer missing actor, Membership, Request ID, Task ID, version, previous owner or release witness from a nearby timestamp, Session current owner, or another Task. Unrecoverable ambiguity is a normal neutral result; it is not permission to repair append-only history in place.

## 14. H1/H2/H3 findings and minimal corrections

**H1:** `accept-task-command.ts` takes post-lock stage time; `guest-retrieval-cancellation-command.ts` calls `loadDispatchOperationTime`, whose implementation uses transaction-start time. A cancellation transaction can start first, wait on Session, then commit after Accept with an earlier event timestamp. The exact falsifier schedules this through real commands. Use validated Task version edges for causality. Keep equal operation timestamps as pair correlation where writers use them; remove the requirement that successive operations have increasing timestamps. Current ignored SQL already does this.

Transaction-start time, statement-start time, application wall time, database wall time and commit order are different concepts. A UUID tie-breaker or global sequence allocation is not evidence of commit order. Existing operation IDs must be used only where the writer actually persists a correlation; Emergency's receipt does not imply ordinary Assign/Reassign have the same identifier.

**H2:** current SQL adds canonical previous/new owner fields to kind/time pairing, then validates unique versions and chain continuity. Two different edges in the same millisecond can therefore be distinguished. The test is privileged synthetic insertion, not a real-command collision reproduction. No impossibility proof was established by this review; a timestamp precision of milliseconds does not guarantee uniqueness. Require a migration-constraint inspection and a real-writer feasibility check before classifying the fixture as impossible. Identical repeated edges with indistinguishable correlation remain neutral; never order them arbitrarily by UUID.

**H3:** the old Session/time fallback could select another Task's cancellation Audit. Current SQL selects lifecycle Audit through exact Task aliases or exact Request linkage. A sibling with its own Task/Request is excluded. An Audit claiming this Request but contradictory Task must remain visible to the validator and fail closed. Validate both camelCase and snake_case aliases whenever present; one correct alias must not mask a conflicting second alias.

Latest local notes report focused corrections passing. Preserve original falsifiers as historical witnesses and rerun the corrected matrix at the exact frozen candidate. Do not count a test intentionally observing a stale positive as a safety pass.

## 15. Writer/evidence map and remaining exact-source checks

| Event | Authority and version evidence | Required check before implementation |
| --- | --- | --- |
| Assign | Task recipient, Staff initiator, null previous holder; paired TASK_ASSIGNED/ASSIGNED | Manual/self/ranked paths all emit the same canonical relationship |
| Accept | Exact current holder acts; ASSIGNED→ACCEPTED; Task CAS | Post-lock time; no assumption it precedes cancel timestamp |
| Decline | Previous holder acts; ASSIGNED→QUEUED; no new owner | Decline breaks the direct-transfer explanation |
| Reassign | Exact previous/new holder; status retained; Task CAS | Unique paired Audit/Dispatch despite millisecond collision |
| Emergency | Separate IN_PROGRESS ownership change, receipt/history, Session effects | Read complete Emergency history and version contract; never infer custody transfer |
| Guest cancel | Exact Request/Task, GUEST Audit, Task and Session version increments | Whole transaction binds PARKED Session and cancelled Request/Task |
| Start Retrieval | Exact Task/Request references and Task version edge | Canonical camelCase metadata, key checkout, Session/Request transitions |
| Mark Ready | Physical Session progress | No COMPLETED inference; determine whether any Task version changes |
| Initiate Handoff | Handoff verification lifecycle | HANDOFF_PENDING remains nonterminal |
| Complete Handoff / release | Exact Task/Request completion, Session completion, release Audit and custody | One transaction; actor/key-slot/time correlation and final versions |

Directly inspected `record-task-mutation.ts` writes Task mutation, Dispatch and Audit on the supplied transaction. `complete-handoff-audit.ts` records exact Task and Request in completion and Task/key-slot in release. The remaining writer paths and SQL constraints require direct inspection under P0; this table does not claim those checks were already completed.

## 16. U-001 and U-002 authorization mapping

Resolve the exact User and StaffAuthSession/token generation. Require active User, exact active historical Membership, permitted field role, active Organization and original Location, explicit grant and current eligible Shift. A later Shift at the same original Location may qualify; it need not be the historical Shift. Exactly one **eligible** operational scope must exist. An active but ineligible second Shift does not by itself create ambiguity, but its activation paths must be fenced.

Assignment before Accept qualifies when canonical committed evidence identifies the viewer as recipient. Supervisor actor and recipient can differ. A replacement Membership for the same User does not inherit entitlement.

For U-002 use the latest relevant ownership edge on the original live Task. A→B qualifies for A only while B is the current owner and no later conflicting transfer supersedes it. A→B→A is not taken by another. A declines and B is assigned is not direct takeover. Terminal cancellation/completion overrides older transfer only with its own full proof. Emergency evidence requires its separate validated contract; do not silently map every Emergency event to REASSIGNED.

## 17. Authorization-release policy proposal

Compare policy A (early transaction authorization sufficient), B (final protected proof near handoff) and C (synchronized egress). A is simplest but permits a larger preventable stale interval. B best matches the owner's direction and is recommended. C requires writer/egress coordination across instances and still cannot retract transmitted bytes; it is disproportionate unless the owner expressly requires that stronger boundary.

The proposed linearization point is the **final complete authority/history evaluation under the full qualified fence set**. Successful COMMIT makes the result eligible for release, not a reusable grant. Locks end at COMMIT. A writer committing after that point can invalidate present authority or change Task truth before bytes leave; only an explicitly accepted in-flight rule can permit that residual.

Start the 150-ms candidate lease conservatively at final proof completion, not after COMMIT acknowledgement, so a slow COMMIT does not create an uncounted stale interval. This is a recommended refinement to DEC-112, not an edit or acceptance of that file. The overall 2,000-ms deadline remains independent. Expiry at handoff suppresses positive delivery even if the lease remains valid.

Default: **no unapproved exception**. Repeated SELECTs cannot guarantee suppression for a category requiring zero post-proof stale release. Either the owner expressly accepts its bounded residual, or a concrete synchronized mechanism must qualify before positive delivery. Do not encode an unenforceable “suppress all late revocations” promise.

## 18. DEC-112 reconciliation and owner decisions

Keep DEC-112 Proposed and untouched in this task. Recommend a subsequent authorized revision that:

1. Distinguishes a single final protected transaction from the optional two-read implementation.
2. Defines lease start at final proof and the actual adapter handoff rather than a test hook.
3. Separates current auth failure, concealed no-proof and transient infrastructure failure.
4. Explicitly accepts/rejects each late-revocation class and names any required cancellation channel.
5. States that expiry has an independent clock fence and transmitted bytes are outside recall.
6. Separates positive-response deadline from bounded cleanup settlement.

Minimum owner decision package: approve/reject U-003-R's category matrix and residual exposure; approve/tune U-003-T; confirm whether unsupported Emergency/legacy histories fall within permitted neutral handling. Architecture and HTTP recommendations remain subject to Gate A contract review. No new approval is needed merely to save this proposed plan.

## 19. Sixteen-category revocation matrix

All rows require fresh denial/recomputation when the change precedes final proof. Every row requires reader-first and writer-first tests, plus a fresh request after revocation. “Propose bounded” is not existing authorization.

| Category | Before final proof | After final proof, before handoff | Fence / test focus | Policy authority |
| --- | --- | --- | --- | --- |
| 1 Normal Shift End | No eligible scope: conceal | Propose bounded completion | Exact Shift + End writer; respect active-task blockers | U-003-R approval |
| 2 Force Shift End | Conceal | Propose bounded completion | Real Force End writer on both sides of proof | U-003-R approval |
| 3 Membership disable | Conceal | Default deny; propose explicit bounded exception only if owner accepts | All relevant Membership rows, handover/CAS | Separate existing rules; U-003-R |
| 4 Role downgrade | Recompute field eligibility | Default deny pending explicit exception | Membership role update | U-003-R; no added field roles |
| 5 LocationAccess revoke | Conceal revoked scope | Bounded previously authorized response | Grant + insertion/writer fencing | Accepted DEC-108 narrowly |
| 6 Organization/Location deactivate | Conceal inactive scope | Default deny pending explicit exception | Org/Location lifecycle locks | U-003-R; not equivalent to grant revoke |
| 7 User disable | Deny authentication/authority per existing contract | Best-effort cancel; residual cannot be recalled | User/security fence; all instances considered | DEC-081 as referenced by DEC-108; full focused contract check in P0 |
| 8 Logout | 401 | Suppress if known; unknown late gap requires explicit rule | Exact StaffSession | Existing credential semantics + U-003-R |
| 9 Staff Session revoke | 401 | Same explicit-rule requirement | Exact Session/revocation state | U-003-R |
| 10 Access token rotation | Reject old generation | Do not assume old token remains valid; decide bounded residual | Exact token hash/session creation identity; legitimate refresh | Credential contract + U-003-R |
| 11 Token/absolute expiry | 401 | Suppress at final boundary using conservative time budget | DB clock plus monotonic elapsed time | No proposed post-expiry exception |
| 12 MFA assurance loss | Apply existing applicable requirement | Suppress known loss; unresolved residual | Existing assurance/factor authority | No new field-role MFA rule; U-003-R |
| 13 Direct Task transfer | Recompute exact outcome | Propose bounded snapshot result | Task version and ownership chain; transfer-back | U-003-R |
| 14 Task cancellation | Terminal proof or neutral | Propose bounded snapshot result | Task/Request/Session; sibling new Task | U-003-R |
| 15 Task completion | Terminal release proof or neutral | Propose bounded snapshot result | Completion/release/custody | U-003-R |
| 16 Eligible-scope change | Require exactly one usable scope | Default deny pending explicit exception | New Membership/Shift/grant activation, not only existing-row changes | U-003-R |

For every unresolved late class, the residual is a reason enum authorized at the final proof but potentially no longer authorized/current at handoff. No names, vehicle data or actor IDs reduce consequence, but do not eliminate the security decision. Cross-tenant access is never an accepted residual.

## 20. PostgreSQL lock and concurrency design

Retain the candidate's nonblocking User-security advisory and exact Staff credential fence; lock relevant User/Membership/Organization/Location/Shift/grant facts in deterministic order, then persisted target Session/Task/Request. Scope-check before locking another tenant's target. All positive evidence must be evaluated after the necessary locks are held.

Do not label this SQL `READ ONLY`: PostgreSQL locking SELECTs are incompatible with that transaction mode. The contract is **no business DML**, with locks in a normal transaction. The existing generic `inDispatchTransaction` has unbounded BEGIN/COMMIT/ROLLBACK and unconditional release; do not reuse it as proof of whole-request cleanup safety.

| Race | Transaction A / B and unsafe schedule | Required protection and outcome |
| --- | --- | --- |
| Reader / revoke | A reads grant; B revokes; A returns old proof | A protected read first: B waits or reader fails on contention; B first: A sees revoke; late-after-COMMIT uses accepted policy |
| Reader / second scope | A counts one scope; B inserts/activates second | Existing rows alone insufficient; verify actual writer participation in User/parent fence, including absent-row paths |
| Reader / Task change | A proves transfer; B transfers back or cancels | Exact Task/Session/Request protection; fresh snapshot or busy; after COMMIT use explicit policy |
| Reader / credential rotation | A resolves token; B rotates before protected read | Recheck exact token under lock, 401; no cached principal authority |
| Reader / writer lock inversion | A holds scope/Session, B holds Task and requests another row | Reader NOWAIT aborts and releases; audit advisory, FK and implicit waits separately |
| Reader / expiry | Time passes without a writer | DB-time recheck plus final conservative time fence; locks alone insufficient |

For each race run B commit, B rollback and caller timeout/unknown-outcome schedules. A rollback must not be mistaken for committed revocation; contention may safely return busy without guessing. Unknown reader COMMIT never produces positive. No automatic mutation retry is introduced. Reader retry is a fresh authorization and must stay within existing user-driven recovery behavior.

The current candidate performs roughly fifteen explicit query calls for a full proof, plus credential-helper statements; the deadline wrapper adds timeout-setting round trips. Two full proofs plus credential-only transaction multiply that cost. Instrument actual query counts before optimizing; do not publish this estimate as a measured SQL count. Batch compatible reads only after lock-order and fence equivalence tests.

## 21. End-to-end deadline and resource model

Proposed qualification targets: 2,000 ms admission-to-last-preventable-handoff, 150 ms final-proof-to-handoff. These are not production SLOs. Retained local evidence contains 25 warm 41-Membership samples with p95 56.279 ms/max 100.331 ms; these do not include full HTTP, cold pool or deployment contention.

Use one monotonic admission instant before resolver/middleware work. Carry remaining time through pool acquisition, BEGIN, timeout configuration, locks, history, final credential check, serialization, COMMIT, observers/interceptors and adapter handoff. Statement timeout and lock timeout are sub-budgets, not replacements. NOWAIT failures are busy, not no history.

| Failure | Required behavior |
| --- | --- |
| Pool exhausted | Stop waiting at deadline; attach a late-lease consumer that releases exactly once; bound queued admissions |
| Late acquisition | No SQL after caller expiry; release lease; observe rejected promises |
| Hung BEGIN | State uncertain; retire connection, no further SQL on it |
| SQL deadline / disconnect | Suppress positive; abort/cancel using qualified driver behavior or retire leased connection |
| Hung/uncertain COMMIT | No positive even if read-only result exists; retire rather than return healthy |
| Known active transaction, settled query | Attempt bounded rollback; release only after confirmed settlement |
| Failed/hung rollback | Destroy/retire lease; verify backend leaves idle-in-transaction |
| Second-read failure | Track each transaction independently; prior COMMIT cannot suppress current rollback |
| Late query/result | Consume completion, never publish; do not concurrently issue rollback over an in-flight operation |
| Delayed PID cancellation | Do not fire admin cancellation against a backend that may have been reused |
| Event-loop stall / serialization delay | Recheck monotonic deadline and lease immediately before sending; late positive forbidden |
| Client abort | Cancel positive path, clean resources; do not invent a successful HTTP reply |
| Process loss | PostgreSQL disconnect releases transaction eventually; exercise actual connection/process loss, not just graceful abort |

Current cleanup helpers allow up to 350 ms rollback and 500 ms retirement wait. Therefore a 2,000-ms positive deadline is **not** proof all cleanup completes within 2,000 ms. Decide whether to reserve cleanup inside admission budget or explicitly define bounded post-response cleanup, with a candidate 850-ms settlement ceiling under responsive infrastructure. No finite JavaScript timer guarantees wall-clock execution while the process is stalled. Track queued acquisitions, active leases, timeout stage, retirement and backend transaction state.

Gate B measures cold/warm p50/p95/p99/max, concurrent same-User and different-User requests, dense histories, many Memberships, pool saturation and writer impact. Record runtime versions, pool size, dataset and query count. Do not increase budgets to conceal a leak. Ordinary command latency and both prior deadlock regressions must remain acceptable under a declared measured load.

## 22. HTTP Outcome API design

Conditional contract: `GET /v1/staff/tasks/:taskId/outcome`; strict UUID; no caller-selected Organization, Location, Membership or Shift. Use shared `@valet/contracts` schema and exports. Reject unsupported query/body parameters consistently with the established transport conventions.

Positive body is exactly `{ "outcome": "GUEST_CANCELLED" }`, or `TAKEN_BY_ANOTHER_EMPLOYEE`, or `COMPLETED`. No Task details, owner, reason text, Request, vehicle, Session or historical metadata. No extra positive values.

| Result | Proposed HTTP behavior | Internal distinction |
| --- | --- | --- |
| Invalid/missing/expired credential | 401 existing auth contract | auth-lost |
| Malformed UUID/transport | 400 existing validation contract | invalid-input |
| Unknown/foreign/unauthorized Task | Same concealed 404 envelope | target-denied |
| Historical Membership ineligible / ambiguous scope | Same concealed 404 | scope-denied |
| Authorized but unproven/ambiguous history | Same concealed 404 | no-proof |
| NOWAIT contention / deadline | Controlled generic 503 | busy / timeout |
| Client disconnected | No response after abort | aborted |
| Unexpected internal failure | Existing sanitized 500 mapping | failure |

Avoid `200 {outcome:null}` unless separately accepted: a success shape for known-but-unproven targets can create an existence distinction. Concealing categories externally does not mean conflating them internally. Global admission failure may return 503 before any target lookup; never condition a foreign-target busy response on private target locks.

Use `setNoStoreResponseHeaders` on success and every error. Register the route in request-ID, operation-runner/observer and exception-filter route classification. Do not assume controller headers cover errors thrown before controller entry. Validate response before release; prove actual NestJS serialization/filter behavior in Gate B.

### Existing implementation patterns

Nearest inspected pattern: `DispatchModule` imports AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule; registers Dispatch and Emergency controllers and request-ID middleware. `EmergencyTaskTakeoverController` injects runtime pool, runner and StaffSession resolver and calls an explicit query. Follow that pattern; a new service layer is optional, not mandatory.

## 23. Employee Client design

Relevant existing files: `packages/employee-client/src/employee-retrieval-flow-session.ts`, `employee-retrieval-flow-state.ts`, `employee-retrieval-flow-types.ts`, `employee-retrieval-flow-transport.ts`, and their existing tests. Add a focused outcome query/reducer module if necessary to stay within structure limits; do not grow the central flow indefinitely.

Use an immutable recovery target: exact User/auth generation, Membership, Organization, Location, Shift, original Task and Session, request generation and lifecycle generation. Capture before starting the read and compare all fields before applying it. Existing `isRetrievalTargetCurrent` checks generation and scope; the session's `isCurrent` additionally checks target object identity and request counter. Preserve those existing fences and extend them to the outcome request rather than claiming they are absent. `executeRead` can update the bound target Task after reconciliation; the historical outcome must retain its original immutable Task identity. Never query an empty Task ID or substitute the newest Task on the same Session.

On logout, identity/scope change, background, unmount, new recovery request or new Task: abort and invalidate the generation; clear positive reason. Foreground starts fresh authority. Store no durable positive cache. Preserve existing auth-loss behavior before applying neutral recovery copy.

Only canonical server enums produce cases 1/2/4. Confirmed native offline produces case 7. DNS, TLS, fetch exception, server 503, timeout and unknown reachability produce case 8. Existing Back/Retry continues read reconciliation; Retry must never replay Start/Ready/Handoff commands automatically.

## 24. Native Design Freeze plan

Existing `apps/valet-native/src/retrieval/native-retrieval-panel.tsx` passes title/body to `NativeRetrievalRecover`; `native-retrieval-copy.ts` currently maps unknown title to connection copy. Add reason selection and EN/AR copy only. Preserve stage content, styles, typography, spacing, icons, hierarchy and navigation. Handoff/Release screens are outside scope.

Use existing connectivity owner in `apps/valet-native/src/auth/native-auth-runtime.ts`; qualify its confirmed-offline signal before case 7. Stale notification entry may require narrowly scoped changes in `native-task-action-sequence.ts` and `native-task-reentry.ts`, conditional on preserving the original Task identity.

Mounted tests assert all five messages, AR/EN and unchanged Back/Retry behavior. Visual comparisons cover Arabic dark mode and English light mode at the existing device geometry. Real-device cancellation while mounted and stale notification entry remain physical QA requirements; simulator/mounted tests are not physical proof.

## 25. Proposed implementation plan

### Work Breakdown Structure

All tasks below are future COS work, conditional on the named gates. Reviewer means the future gate owner, not a reviewer invoked in this documentation task. One writer per worktree; parallel work uses separate owned worktrees only when subsequently authorized.

Command retry/concurrency classification: no new mutation is proposed. First execution, identical retry, concurrent identical requests and retry after an earlier GET each require fresh authority; a prior positive is never replay authority. A conflicting command is covered by the reader/writer matrix. Different GET input means a different exact target and a new proof. Existing protected-command idempotency is unchanged, and the Client must not replay those commands. If option C is separately approved, each changed writer needs its own first-execution, identical-retry, concurrent-identical, conflicting-command, retry-after-success and changed-payload matrix before implementation.

| ID / objective | Preconditions / dependencies | Files / concrete work | Invariants / tests | Acceptance / reviewer | Stop / deliverable |
| --- | --- | --- | --- | --- | --- |
| P0.1 Freeze exact evidence | Existing branch; no concurrent writes | Three original plans, DEC-112, ignored candidate/tests/logs; inventory SHA256, tracked/local distinction | Preserve all local assets; compare newest test timestamps and source fingerprints | Every cited pass tied to exact candidate or marked historical; COS evidence owner | Changing source without attribution: stop; evidence manifest |
| P0.2 Close source coverage | P0.1 | Full governance/Accepted DEC texts; Task/Request/Dispatch/Audit migrations; Assign/Decline/Reassign/Emergency/Start/Ready/Handoff writers and HTTP lifecycle | Verify exact fields, timestamps, constraints, public exports; no inferred correlation | Writer/constraint map with source references; architecture gate owner | Material contradiction: decision required; source coverage appendix |
| P1.1 Qualify corrected history | P0.2 | Existing ignored proof and historical tests; later dedicated production query | H1/H2/H3, actor provenance, duplicate aliases, malformed exact Task, siblings, version gaps | Correct ordinary histories positive; malformed/ambiguous histories neutral; security reviewer | False positive or unresolved required normal case: stop; frozen proof/test report |
| P1.2 Qualify Emergency coverage | P0.2, U-003-E | Emergency history/receipt/mutation and specific proof branch | IN_PROGRESS transfer, A→B→A, unrelated Emergency, no fabricated custody | Exact supported transfer proof or explicit approved legacy limit; domain reviewer | Missing canonical relationship: neutral and escalate required coverage; coverage decision |
| P2.1 Resolve release policy | P0.2 | DEC-112 proposal and decision log in separately authorized docs task | Sixteen categories, expiry, proof-to-handoff lease, no final-byte promise | Explicit owner record for every unresolved class and numeric budget | No exception accepted: positive gate stays closed; decision artifact |
| P2.2 Qualify scope fences | P2.1 | Scope candidate; actual Shift/access/onboarding/role/credential writers | Both orders plus rollback/unknown, absent-row activation, ineligible second Shift | No unauthorized positive or uncovered insertion path; security reviewer | Demonstrated gap: fix bounded mechanism or stop; race matrix |
| P3.1 Qualify lifecycle | P2.2 | Deadline candidate, cleanup, runtime pool and operation runner | Pool/BEGIN/SQL/COMMIT/rollback/abort/stall/late result; backend PID settlement | Zero leaked leases, zero idle transaction after defined settlement; infrastructure reviewer | Detached work or uncertain healthy release: stop; deadline report |
| P3.2 Compare one/two final reads | P1.1, P3.1 | Disposable adapter model, query/transaction instrumentation | Same authority negatives, same outcome positives, identical late-policy classification | One-read selected only if equivalent; otherwise one bounded fallback choice | Neither meets policy: stop; architecture selection record |
| P4 Gate A | P0–P3 complete | Exact design, decision, fingerprints, executable race evidence | Review no missing current authority, no unsupported history, resource-safe model | Controlled Backend implementation eligibility only; independent security gate owner | Reject on demonstrated contract violation; signed scoped verdict |
| P5 Backend implementation | Gate A plus implementation authorization | Dispatch controller/query modules, shared contracts/exports, existing HTTP route/error infrastructure | No DML, reason-only schema, strict UUID, fresh auth, no-store | Focused code review and unit/integration contract checks; Backend owner | Scope/schema expansion or auth regression: stop; bounded implementation commit |
| P6 Gate B | P5 | Registered NestJS route tests, owned PG harness, real client disconnect/serialization tests | Actual 200/401/404/503/500, parity, all revocation schedules, load and both old deadlock suites | No unauthorized positive; resource/timing bounds met on declared workload; independent Backend security reviewer | Actual handoff cannot meet policy: contain positive path; real HTTP evidence |
| P7.1 Employee Client | Gate B | Flow transport/types/state/session plus focused outcome/fence module | Exact target, generation invalidation, neutral errors, no command replay | All stale-response and transport cases pass; Client reviewer | Identity leak/replay: stop; Client commit |
| P7.2 Native messages | P7.1 | Retrieval copy/panel, connectivity adapter, conditional stale-entry files | Five cases, EN/AR, UI freeze, auth loss, Back/Retry | Mounted and visual parity; Native reviewer | Redesign or positive inference without proof: stop; Native commit |
| P8 Gate C/D final verification | P6/P7 | Relevant package gates, root gates, writer regressions, physical QA and delivery report | Mixed Backend/Client versions, rollback, no sensitive logs, no production mutation | No unresolved critical/major task defect; CI observed separately; owner/cross-review | Failure prevents feature completion; release-readiness report only |

Complexity: P0/P1 medium; P2/P3 high; P5 medium; P7 medium; P8 medium. No calendar promise. The historical prototype corrections should be qualified, not blindly reimplemented from the stale brief.

## 26. Test matrix

Legend: **LOG** retained run output inspected; **REPORT** prior document claim; **DEF** existing test definition inspected, not rerun; **NEW** required; **PROD** must exercise shipping path; **DEVICE** physical QA. None means executed by this planning author.

| ID | Cases | Existing evidence | Required completion evidence |
| --- | --- | --- | --- |
| H01 | Assignment before Accept; Accept; supervisor actor different from recipient | LOG historical actor/supervisor cases | PROD positives at exact final source |
| H02 | Guest cancel; direct Reassign; terminal precedence | LOG candidate domain tests | PROD exact Task/Request positives and competing terminal schedules |
| H03 | Transfer-back; indirect transfer; decline then assignment; initial assignment | Candidate/history coverage reported, not exhaustive review | NEW explicit negative assertions; no positive transfer |
| H04 | Completed handoff and vehicle release; READY/HANDOFF_PENDING negatives | LOG candidate completion; completion Audit inspected | PROD full custody/release evidence positives and missing-witness negatives |
| H05 | Missing Staff actor, wrong entity, missing Dispatch/Audit, wrong Task/tenant/Location | LOG actor/malformed cases; partial source | PROD two-principal and malformed evidence matrix |
| H06 | Timestamp inversion; same-ms edges; sibling Audit | DEF real H1 / synthetic H2/H3; current SQL corrected; REPORT 12/15 focused passes | Frozen-candidate rerun plus pairing uniqueness counterexamples |
| H07 | Dense history, duplicate versions, corrupt legacy, conflicting aliases | LOG cardinality; REPORT alias tests | PROD budget and fail-closed integrity matrix |
| H08 | Emergency and original Membership on later Shift | Not independently qualified here | NEW direct writer/reader cases and approved coverage decision |
| A01 | Exact Staff Session; logout; revoke; rotation; expiry | Candidate tests/reports, not shipping | PROD before proof / after proof / before handoff; new GET denial |
| A02 | User disable, MFA loss, Membership disable, role downgrade | Partial candidate/report evidence | PROD applicable exact contracts; no invented field-role MFA |
| A03 | Grant revoke; Shift End/Force End; Org/Location deactivate | LOG/REPORT candidate writer schedules | PROD all sixteen policy rows, both orders and rollback |
| A04 | Multiple eligible scopes; ineligible second Shift; concurrent new Membership | LOG scope/cardinality and REPORT real activation | PROD insertion/activation fencing with absent-row schedules |
| R01 | Reader-first/writer-first; contention; SQL timeout; new deadlock | LOG candidate runs; REPORT writer regressions | PROD full writer interaction plus no new deadlock delta |
| R02 | Pool exhaustion/late lease; BEGIN/COMMIT delay; rollback failure; uncertain state | REPORT 21 deadline tests; cleanup source inspected | Real pool/driver/backend settlement, no active reused lease |
| R03 | Abort, late query/result, event-loop stall, response preparation timeout | Candidate definition/source only | PROD actual HTTP disconnect and adapter barriers |
| R04 | Post-COMMIT revoke | LOG passing policy witness demonstrates residual | PROD accepted-rule assertion; never label stale witness a safety pass |
| W01 | Both prior deadlock fixes | REPORT official 12/12; source inspected | Rerun tracked positive suites; keep old intentional witnesses separate |
| HTTP01 | Strict positive 200; 401; concealed 404 parity; busy 503; sanitized failure | Test-only controller cannot qualify | NEW PROD full app route/filter/observer integration |
| HTTP02 | No-store on all paths; request IDs; serialization; final handoff | Not established | NEW PROD, including pre-controller errors |
| N01 | All five messages, EN/AR, offline vs transport failure, auth loss | Existing UI/flow source inspected | NEW mounted tests and transport contract tests |
| N02 | Back/Retry; stale Task; new Task same Session; foreground/background; Shift/account change | Existing fence files discovered | NEW exact Task/request/lifecycle generation race tests; zero command calls |
| N03 | UI freeze and reported cancellation experience | Prior screenshot description only | DEVICE AR dark and EN light; visual parity and mounted/stale entry |
| M01 | Old Backend/new Client and new Backend/old Client | Not established | NEW unknown route/enum safely neutral; no operational command changes |

No migration test is required for a docs-only change. If a migration becomes approved, versioned migration/constraint tests become mandatory; schema synchronization is not equivalent.

## 27. Independent review gates

**Gate A:** exact-source coverage closed; owner release policy resolved; frozen historical/scope/deadline candidate passes positive and negative matrix; full writer fence map; no known unauthorized positive; bounded lifecycle model; independent architecture/security decision. Gate A approves controlled implementation, not production readiness. It cannot require an already-shipping route that does not yet exist.

**Gate B:** actual route registered and tested through real NestJS, PostgreSQL, pool, serialization and error infrastructure; all category races classified by accepted policy; no leaked leases or disclosure parity defect; performance/load report and preserved writer regressions; independent Backend security verdict.

**Gate C:** Client/Native integration, five messages, exact-target/generation fences, auth/offline distinction, no replay, EN/AR and design freeze.

**Gate D:** relevant regression, required root/CI checks, physical QA or explicit documented unresolved qualification, rollback/mixed-version evidence, final cross-review and owner delivery decision. No self-merge. This plan task performs self-review only at the owner's request; it does not waive future independently required Gate A/B reviews.

## 28. Risks / boundary violations

| Risk | Severity / evidence | Consequence | Mitigation / validation | Gate |
| --- | --- | --- | --- | --- |
| Missing current authority or cross-tenant proof | Critical potential; core contract | Unauthorized historical disclosure | Exact persisted scope, two-principal tests, no caller scope | A/B |
| Late revocation policy undefined | High, observed prototype residual | Unapproved stale disclosure | Explicit per-class permission or qualified suppression; real handoff barriers | A/B |
| Missing-row scope activation | High potential; not fully independently mapped | Ambiguous User scope accepted | Actual writer insertion/parent/advisory fence map | A/B |
| Historical malformed evidence accepted | High integrity; earlier synthetic actor falsifier | False positive entitlement/outcome | Staff provenance, exact aliases, unique version/pair checks | A/B |
| Correct history rejected | Medium; H1 real, H2/H3 synthetic witnesses | Misleading neutral/reduced feature value | Version order and scoped pairing; qualify latest correction | A/B |
| Emergency history unsupported | Medium/high coverage gap | Approved transfer case may stay neutral | Exact separate history contract; owner coverage decision | A/B |
| Connection/transaction leak | High resource risk; prior candidate leak reported | Pool exhaustion and writer blocking | Per-lease state machine, destroy uncertain, PID settlement | A/B |
| Repeated proof/timeout round trips | Medium inferred cost | Latency, contention, maintainability | One-final-read qualification, query-count measurement | B |
| False HTTP concealment/parity | High potential; route absent | Existence or authorization oracle | Same envelopes; no foreign target locking; timing-distribution comparison | B |
| Client stale reason | High potential | Another Task/account reason displayed | Full target/generation/lifecycle fences, clear on change | C |
| Mixed-version drift | Medium inferred | Parse failures or unsupported positives | Strict enums and neutral unknowns; staggered deployment tests | D |
| Overstated evidence | High process risk | Unsafe gate approval | Fingerprints, log/report/test-definition separation | A–D |

## 29. Critical path and parallel work

Critical path: P0 exact evidence → P1 proof coverage and P2 owner policy/fences → P3 lifecycle and one/two-read qualification → Gate A → Backend → Gate B → Client/Native → Gate C/D.

Policy drafting, historical test inventory and deadline fault-model preparation can proceed concurrently as read-only tasks, but this assignment uses no supporting workers. Future parallel writers require isolated ownership and explicit coordination for shared files. Backend integration, release-policy acceptance and gate decisions remain sequential. Client test specifications may be prepared before Gate B; positive wiring may not be enabled before it.

Reuse existing owned PostgreSQL fixture and original falsifiers. New tests are primarily real-route release, missing-row writer coverage, exact Native target fences and any uncovered Emergency proof. Optional improvements: projection table, generalized cancellation framework, global timestamp normalization, broad indexes without a measured need, unrelated deadlock remediation. None automatically blocks this feature.

## 30. Failure and rollback paths

| Failure | Containment | Preserve / next action |
| --- | --- | --- |
| Legacy relationship cannot be proven | Neutral only for that history | Keep proof and other valid cases; document irrecoverable fields; seek approval if ordinary required coverage is lost |
| Legitimate current writer case remains false-neutral | Do not declare feature complete | Narrow proof correction and regression; no guessed attribution |
| One-read placement fails | No positive release from unqualified design | Use the two-read fallback once and rerun affected matrix |
| Both designs miss accepted policy | Keep Outcome positive path disabled/unimplemented | Escalate exact schedule and required policy/mechanism; no endless rechecks |
| Read C contention unacceptable | Bounded busy/neutral client recovery | Profile exact lock/query stages; targeted optimization; C only with evidence and approval |
| Actual HTTP release race violates policy | Suppress positive route response | Preserve core reader/tests; fix adapter boundary or reopen precise policy |
| Writer regression fails | Stop delivery | Preserve both original fixes; isolate new reader interaction; no broad writer rewrite |
| Independent reviewer rejects | Hold owning gate | Respond to concrete finding with source/test proof; unresolved material finding blocks |
| Native regression | Restore previous neutral recovery behavior | Keep qualified Backend additive route; clear outcome state; preserve operational commands |

No rollout, flag activation, deployment, merge or issue closure is authorized by this plan. Future rollback should remove reason delivery while retaining the prior neutral-copy and deadlock fixes. No data rollback is expected from a reader-only implementation; any later migration changes that analysis.

## 31. Finite stopping rules

One frozen evidence package, one primary qualification pass, one practical fallback if its stated trigger occurs, then a gate decision. Correct material defects found in those passes; do not manufacture a fixed review count that requires ignoring a real vulnerability.

Block on demonstrated unauthorized positive, Accepted-contract violation, missing current authority, unexplained exact-Task proof acceptance, unreleased uncertain connection, or required normal-flow omission. Allow neutral for genuinely missing/conflicting legacy evidence. Synthetic tests require schema/reachability classification; privileged fixture insertion is not an unprivileged production exploit.

New unrelated findings receive severity, reproduction, reader involvement and separate-issue recommendation. This task does not authorize creating those issues or expanding implementation. Optional theoretical improvements do not reopen a passed gate without new material evidence. Green totals alone never pass Gate A.

## 32. Definition of Done and ready-to-implement verdict

### Ready-to-implement verdict

**Ready-to-implement verdict: DECISION REQUIRED.** The recommended architecture is concrete, but policy acceptance and the bounded source/qualification gaps listed here prevent claiming Gate A approval.

Feature Done requires all five approved cases, canonical proof, exact current authority, accepted in-flight semantics, actual HTTP/resource qualification, Client stale-response protection, UI parity, relevant tests and observed CI, preserved deadlock fixes and final review. Unverified physical QA must remain visible and must not be represented as completed.

Documentation Done requires English plan, verified paths/encoding/Markdown, no fabricated passes, explicit proposed decisions, only this file staged/committed, normal same-branch push and remote verification. Documentation delivery is distinct from feature readiness.

## 33. COS execution handoff

Start in `D:/kndoom/valet-platform/tmp/issue-442` on `fix/issue-442-retrieval-cancel-state`. Read this document and compare current HEAD with its recorded source baseline; preserve the three local plan modifications, Proposed DEC-112 and ignored probes.

Execute P0.1/P0.2, then qualify the already-corrected historical proof rather than replay the stale 1-pass/3-fail narrative as current status. Obtain the explicit release-policy decision. Qualify one final protected read under the full fence set; use the two-read fallback only for demonstrated HTTP placement need. Assemble Gate A package before requesting production implementation authorization. Do not demand a shipping-route test before controlled implementation, and do not use a test-only route as Gate B evidence.

After authorization and Gate A, implement the reason-only Backend boundary, prove Gate B on the real stack, then integrate Employee Client and Native copy without redesign. Follow P8 for final verification. Count physical code lines before edits; new/modified files stay within 300 lines and oversized legacy files must not grow. Extract task-owned responsibilities rather than compress code.

Future code commits require their own authorization and checks. This task's Git authorization covers only this Markdown plan. No new branch, PR, merge, deployment, force-push or DEC-112 commit follows from it.

## 34. Files expected to change

Definitely relevant source areas: Dispatch module/controller patterns; Auth StaffSession resolution/revalidation; current operational-scope writers; Retrieval canonical writers; existing HTTP filters/runner/no-store; shared contracts; Employee Client Retrieval flow; Native Retrieval copy/panel.

Conditional on U-003 decisions and Gate A: dedicated outcome controller/query/proof modules, typed result/timeout helper, shared outcome schema/export, route/error registration and focused tests. Exact new filenames are implementation choices, not Accepted architecture. Check actual exports before reusing helpers.

### Explicitly out of scope

Not justified yet: new evidence table, backfill, generic authorization service, shared egress infrastructure, writer timestamp overhaul, polling, new states/permissions, UI redesign, Handoff/Release changes or broad deadlock cleanup.

In this assignment the only file changed is this plan. Existing DEC-112 and investigation assets must remain byte-preserved.

## 35. Final recommendation and review limits

Finish through a bounded purpose-specific reader using existing canonical version evidence, the current authority contract and an explicitly accepted final-proof release policy. Simplify repeated transactions only after equivalence qualification. Use neutral for true evidence gaps, not as an excuse to omit correctable approved behavior. Preserve both proven writer fixes and the frozen recovery UI.

This author performed a source-based self-review; no supporting reviewer was used. Source observations, retained log evidence, reported recent runs, proposed mechanisms and unverified coverage are separated above. The largest remaining uncertainty is not whether another SELECT can narrow a race: it is which late-revocation residual the owner accepts and whether the real HTTP boundary enforces the agreed limit.

External technical references for unresolved candidate mechanisms: PostgreSQL distinguishes transaction/statement/current clock time in its [date/time documentation](https://www.postgresql.org/docs/17/functions-datetime.html); its [locking documentation](https://www.postgresql.org/docs/17/explicit-locking.html) describes row/advisory lock behavior; node-postgres documents pool acquisition and client release/destruction in its [Pool API](https://node-postgres.com/apis/pool). These explain mechanisms, not VAYLET policy.
