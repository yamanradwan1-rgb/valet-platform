#!/usr/bin/env python3
"""Heuristic VAYLET planning audit v1.5.

This is a reasoning backstop, not a correctness proof. v1.5 keeps the OMEGA
and authorization-order gates and adds production-evidence inflation checks
for lint/typecheck, migrations, Docker runtime, CI, crash recovery, and readiness.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

VERSION = "1.5"
STANDARD_SECTIONS = [
    "repository facts discovered",
    "binding requirements",
    "existing implementation patterns",
    "locked decisions",
    "derived conclusions",
    "unresolved decisions",
    "risks / boundary violations",
    "proposed implementation plan",
    "test matrix",
    "files expected to change",
    "explicitly out of scope",
    "ready-to-implement verdict",
]
ALLOWED_CLASSIFICATIONS = {"LOCKED", "DERIVED", "UNRESOLVED", "CONTRADICTED"}
IGNORE_TOKENS = {
    "LOCKED", "DERIVED", "UNRESOLVED", "CONTRADICTED", "HTTP", "API", "UUID",
    "ACTIVE", "ENDED", "SELECT", "UPDATE", "INSERT", "DELETE", "POST", "GET",
    "DECISION", "REQUIRED", "READY", "IMPLEMENT", "REPOSITORY",
}


def heading_pattern(name: str) -> str:
    return rf"(?im)^\s*#+\s*(?:\d+\.\s*)?{re.escape(name)}\s*$"


def has_heading(text: str, name: str) -> bool:
    return bool(re.search(heading_pattern(name), text))


def section_span(text: str, heading: str) -> tuple[int, int] | None:
    m = re.search(
        rf"(?im)^\s*(#+)\s*(?:\d+\.\s*)?{re.escape(heading)}\s*$",
        text,
    )
    if not m:
        return None
    level = len(m.group(1))
    body_start = m.end()
    end = len(text)
    for nxt in re.finditer(r"(?im)^\s*(#+)\s+.+$", text[body_start:]):
        if len(nxt.group(1)) <= level:
            end = body_start + nxt.start()
            break
    return body_start, end


def section(text: str, heading: str) -> str:
    span = section_span(text, heading)
    return text[span[0]:span[1]] if span else ""


def section_any(text: str, names: list[str]) -> str:
    for name in names:
        value = section(text, name)
        if value:
            return value
    return ""


def unique(items: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def is_conditional(line: str) -> bool:
    low = line.lower()
    return any(
        token in low
        for token in (
            "if dec", "if u-", "if the accepted decision", "conditional on",
            "alternative ", "option a", "option b", "could ", "may ",
            "depending on", "unresolved", "candidate mechanism", "one option",
            "would be", "would use", "might ", " versus ", " vs ", " vs. ",
        )
    )


def selected_line(line: str) -> bool:
    if is_conditional(line):
        return False
    low = line.lower()
    selecting = re.search(
        r"\b(must|will|should|returns?|emit(?:s)?|use(?:s)?|create(?:s)?|add(?:s)?|"
        r"introduce(?:s)?|implement(?:s)?|maps? to|route is|controller\(|"
        r"requires?\s+(?:for update|for share)|http\s+[245]\d\d)\b",
        low,
    )
    return bool(selecting)


def extract_identifiers(text: str) -> set[str]:
    tokens = set(re.findall(r"\b[A-Z][A-Z0-9_]{3,}\b", text))
    backticks = set(re.findall(r"`([A-Za-z_][A-Za-z0-9_]{3,})`", text))
    return {t for t in tokens | backticks if t not in IGNORE_TOKENS}


def add(warnings: list[str], message: str) -> None:
    warnings.append(message)


def classification_from_line(line: str) -> str | None:
    hits = [c for c in ALLOWED_CLASSIFICATIONS if re.search(rf"\b{c}\b", line)]
    return hits[0] if len(hits) == 1 else None


def check_proposition_polarity(text: str, warnings: list[str]) -> None:
    for line in text.splitlines():
        cls = classification_from_line(line)
        if cls not in {"LOCKED", "DERIVED"}:
            continue
        low = line.lower()
        # General contradiction language inside a supposedly supported claim.
        if re.search(r"\b(contradict(?:ed|s|ory)?|violat(?:e|es|ed)|explicitly false|opposite of|required instead)\b", low):
            add(warnings, "Possible proposition-polarity error: LOCKED/DERIVED row contains evidence that negates the proposition: " + line.strip()[:240])
        # Common OMEGA polarity trap: app time assertion justified by DB time.
        if re.search(r"date\.now|application (?:server )?time|node(?:\.js)? time", low) and re.search(r"now\(\)|database[- ]authoritative|postgres(?:ql)? (?:server )?time", low):
            add(warnings, "Proposition-polarity error candidate: application-time assertion is classified as supported while rationale cites database-authoritative time.")
        # Qualifier injection: original claim says automatic safety, rationale rescues it by validation.
        if "automatically safe" in low and re.search(r"when validated|if validated|after validation|validated as", low):
            add(warnings, "Possible silent proposition repair: `automatically safe` is justified only after adding a validation qualifier.")


def check_classifications(text: str, warnings: list[str]) -> None:
    for m in re.finditer(r"\b(LOCKED|DERIVED|UNRESOLVED|CONTRADICTED)\s*/\s*(LOCKED|DERIVED|UNRESOLVED|CONTRADICTED)\b", text):
        add(warnings, f"Compound classification found: {m.group(0)}. Use exactly one classification.")
    for line in text.splitlines():
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.split("|")]
        for cell in cells:
            hits = [k for k in ALLOWED_CLASSIFICATIONS if re.search(rf"\b{k}\b", cell)]
            if len(hits) > 1:
                add(warnings, f"Classification cell contains multiple labels: {cell}")

    # In adversarial requirement tables, retain the proposition text so polarity can be audited.
    omitted: list[str] = []
    for line in text.splitlines():
        if not re.match(r"\s*\|\s*R\d+\s*\|", line, re.I):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 3 and cells[1] in ALLOWED_CLASSIFICATIONS:
            omitted.append(cells[0])
    if omitted:
        sample = ", ".join(omitted[:8])
        suffix = "..." if len(omitted) > 8 else ""
        add(warnings, f"{len(omitted)} candidate classification row(s) omit proposition text; ID + classification + rationale cannot prove proposition polarity. Examples: {sample}{suffix}")


def check_absence_as_contradiction(text: str, warnings: list[str]) -> None:
    for line in text.splitlines():
        if "CONTRADICT" not in line.upper():
            continue
        if re.search(r"\b(does not exist|doesn't exist|does not have|has no|missing|absent|not present|no .* exists|no column)\b", line, re.I):
            if not re.search(r"\b(forbid|must not|requires?|mandates?|explicitly|incompatible|violates?|audit-only|prohibit)\b", line, re.I):
                add(warnings, "Possible absence-as-contradiction reasoning: " + line.strip()[:240])


def after_section(text: str, heading: str) -> str:
    span = section_span(text, heading)
    if not span:
        return ""
    return text[span[1]:]


def unresolved_concepts(unresolved: str) -> dict[str, bool]:
    pats = {
        "dynamic": r"dynamic|captured|snapshot|revocation|ongoing eligibility",
        "locking": r"lock|lineariz|race|concurr|assignment.*end|end.*assignment|atomic.*assignment",
        "route": r"route|path|endpoint|controller",
        "error": r"error code|http status|conflict code|status code",
        "audit": r"audit event|event name|audit writer|event schema|audit metadata",
        "roles": r"role matrix|allowed roles|supervisor|force[- ]?end|override authority",
        "retry": r"retry|idempoten",
        "migration": r"migration|schema|column|persistence shape",
        "interface": r"boundary|interface|function signature|consumer contract|eligibility function",
        "openwork": r"open work|work ownership|handoff",
        "activequery": r"active shift query|get active|active-shift endpoint",
    }
    return {name: bool(re.search(pat, unresolved, re.I | re.S)) for name, pat in pats.items()}


def check_decision_leakage(unresolved: str, targets: dict[str, str], warnings: list[str]) -> None:
    unresolved_ids = extract_identifiers(unresolved)
    concepts = unresolved_concepts(unresolved)

    for target_name, target in targets.items():
        for line in target.splitlines():
            ids = extract_identifiers(line) & unresolved_ids
            if ids and selected_line(line):
                add(warnings, f"Possible decision leakage into {target_name}: unresolved identifier(s) {', '.join(sorted(ids))}: {line.strip()[:200]}")

    patterns: dict[str, str] = {
        "dynamic": r"\b(must|will|should|requires?)\b.{0,100}\b(dynamic|current)\b.{0,140}\b(user|membership|organization|location|access|status)\b|\bdynamic (?:eligibility )?(?:verification|evaluation)\b",
        "locking": r"\bFOR\s+(UPDATE|SHARE)\b|\bSERIALIZABLE\b|\badvisory lock\b|\bSKIP LOCKED\b|\bguarded (?:update|insert)\b",
        "route": r"@Controller\([\"'][^\"']+[\"']\)|\b(?:POST|GET|PUT|PATCH|DELETE)\s+/[A-Za-z0-9_/{?=&.-]+",
        "error": r"\bHTTP\s+(?:200|201|400|403|404|409|422)\b|\b(?:SHIFT|ACTIVE_SHIFT|SHIFT_HAS)_[A-Z0-9_]+\b",
        "audit": r"(?:audit|event|emit).{0,100}\bSHIFT_[A-Z0-9_]+\b|\bSHIFT_[A-Z0-9_]+\b.{0,100}(?:audit|event|emit)|\bentity_type\s*=\s*[\"']Shift[\"']",
        "roles": r"\b(ORG_ADMIN|LOCATION_MANAGER|VALET_SUPERVISOR|VALET_EMPLOYEE)\b.{0,100}\b(force[- ]?end|override|may end|can end|allowed)\b",
        "retry": r"\breturns?\s+(?:HTTP\s*)?(?:200|201|409)\b|\breturn(?:s)?\s+(?:the\s+)?existing shift\b",
        "interface": r"\b(?:evaluate|check|require|is)[A-Za-z0-9_]*(?:Eligibility|Eligible|Shift)[A-Za-z0-9_]*\s*\(",
        "openwork": r"currentAssigneeMembershipId|current_assignee_membership_id|SHIFT_HAS_OPEN_WORK",
        "activequery": r"\bGET\s+[^\n]*shift|\bgetActiveShift\b|\bactiveShiftResponse\b",
    }

    def semantic_selected(concept: str, line: str) -> bool:
        if is_conditional(line):
            return False
        if re.search(r"\bU-\d{3}\b", line, re.I) and not selected_line(line):
            return False
        low = line.lower()
        if concept == "route":
            return "shift" in low and bool(re.search(patterns[concept], line, re.I))
        if concept in {"locking", "dynamic", "interface", "audit", "activequery"}:
            return bool(re.search(patterns[concept], line, re.I))
        return bool(re.search(patterns[concept], line, re.I) and selected_line(line))

    for concept, active in concepts.items():
        if not active or concept not in patterns:
            continue
        for target_name, target in targets.items():
            for line in target.splitlines():
                if semantic_selected(concept, line):
                    add(warnings, f"Possible semantic decision leakage ({concept}) into {target_name}: {line.strip()[:220]}")
                    break


def check_route_evidence(facts: str, plan: str, warnings: list[str]) -> None:
    if not re.search(r"@Controller\(|/v1/|v1/staff|staff/shifts", plan):
        return
    controller_literals = re.findall(r"@Controller\((?:\"|')([^\"']+)(?:\"|')\)", facts)
    controller_paths = re.findall(r"apps/api/src/modules/[^\s`]+controller\.ts", facts)
    if len(set(controller_literals)) < 2 and len(set(controller_paths)) < 2:
        add(warnings, "Concrete route proposed without evidence from at least two current staff controllers in Repository facts.")


def scenario_blocks(text: str) -> list[tuple[str, str]]:
    # Supports headings/bullets such as `### C1 ...`, `**C1. ...**`, or `C1. ...`.
    starts = list(re.finditer(r"(?im)^\s*(?:#{2,6}\s*)?(?:[-*]\s*)?(?:\*\*)?C(\d{1,2})(?:\*\*)?\s*[.):-]", text))
    blocks: list[tuple[str, str]] = []
    for i, match in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        blocks.append((f"C{match.group(1)}", text[match.start():end]))
    return blocks


def check_concurrency_completeness(text: str, warnings: list[str]) -> None:
    blocks = scenario_blocks(text)
    if len(blocks) >= 4:
        groups = {
            "transactions": r"transaction\s+a|tx\s*a",
            "resources": r"rows?|resources?|index|membership|shift|location|access",
            "sequence": r"read|write|insert|update|select|lock|sequence|step",
            "interleaving": r"interleav|race|between|before|after|concurrent",
            "existing": r"existing (?:db|database|protection|constraint)|partial unique|foreign key|constraint",
            "missing": r"missing protection|not protect|gap|insufficient|unresolved",
            "linearization": r"linearization|linearize|commit point|authoritative point|cannot derive",
            "status": r"LOCKED|DERIVED|UNRESOLVED|CONTRADICTED",
            "owner": r"VAL-005[BDE]|own(?:er|ing) (?:slice|task)|later slice",
        }
        incomplete: list[str] = []
        for name, block in blocks:
            missing = [label for label, pat in groups.items() if not re.search(pat, block, re.I | re.S)]
            if missing:
                incomplete.append(f"{name} missing {', '.join(missing)}")
        if incomplete:
            add(warnings, "Concurrency scenario completeness gaps: " + "; ".join(incomplete[:8]) + ("; ..." if len(incomplete) > 8 else ""))

    concurrent_context = re.search(r"uncommitted|winner transaction|waits? for|blocked by.*transaction|concurrent.*start", text, re.I | re.S)
    if concurrent_context:
        missing = []
        if not re.search(r"\bcommit(?:s|ted)?\b", text, re.I):
            missing.append("commit branch")
        if not re.search(r"\brolls? back\b|\brollback\b|\brolled back\b", text, re.I):
            missing.append("rollback branch")
        if not re.search(r"unknown (?:commit )?(?:status|outcome)|timeout.*unknown|client.*cannot (?:know|tell)|ambiguous commit", text, re.I | re.S):
            missing.append("unknown caller outcome")
        if missing:
            add(warnings, "Uncommitted/concurrent transaction analysis is missing: " + ", ".join(missing) + ".")


def check_free_text_security(text: str, warnings: list[str]) -> None:
    if not re.search(r"overrideReason|override_reason|free[- ]text reason|reason.*metadata|metadata.*reason", text, re.I | re.S):
        return
    # Flag automatic safety or allowlisting claims not paired with value-level analysis.
    if re.search(r"(?:reason|overrideReason).{0,100}(?:automatically safe|safe metadata|allowlisted|is safe)", text, re.I | re.S):
        if not re.search(r"safe key.*safe value|secret[- ]bearing|credential.*value|value.*credential|length bound|privacy|sensitive data|content policy|coded reason", text, re.I | re.S):
            add(warnings, "Free-text audit reason is treated as safe without value-level secret/privacy/length analysis. Safe metadata key != safe arbitrary value.")


def check_falsification(text: str, warnings: list[str]) -> None:
    fals = section_any(text, ["Falsification results", "Falsification pass"])
    classifications = 0
    for line in text.splitlines():
        if "|" in line and classification_from_line(line) in {"LOCKED", "DERIVED"}:
            classifications += 1
    if fals:
        coverage = re.search(r"Falsification coverage\s*:\s*(\d+)\s*/\s*(\d+)", fals, re.I)
        if coverage:
            done, total = map(int, coverage.groups())
            if done != total:
                add(warnings, f"Falsification coverage is incomplete: {done}/{total}.")
            if classifications and total < classifications:
                add(warnings, f"Falsification coverage denominator ({total}) is smaller than detected LOCKED/DERIVED classified rows ({classifications}).")
        elif classifications >= 5:
            entries = len(re.findall(r"(?im)^\s*(?:[-*]|\d+\.)\s+|\bR\d+\b", fals))
            if entries < min(classifications, 5):
                add(warnings, f"Falsification section appears sampled rather than complete: detected {classifications} LOCKED/DERIVED classified rows but only ~{entries} falsification entries and no N/N coverage claim.")
    if re.search(r"\b(every|all)\b.{0,50}\b(locked|derived|conclusion).{0,60}\b(falsif|tested|checked)", text, re.I | re.S) and not re.search(r"Falsification coverage\s*:\s*\d+\s*/\s*\d+", text, re.I):
        add(warnings, "Completion claim says every/all LOCKED or DERIVED conclusion was falsified/checked without explicit coverage accounting.")


def check_artifact_leakage(unresolved: str, verdict: str, files_text: str, warnings: list[str]) -> None:
    if not re.search(r"DECISION REQUIRED", verdict, re.I):
        return
    if not unresolved.strip():
        return
    exact_new = [
        line.strip() for line in files_text.splitlines()
        if re.search(r"\.(?:ts|tsx|sql)\b", line, re.I)
        and re.search(r"\bNEW\b|\bcreate\b|\bnew file\b|\*\(NEW\)\*", line, re.I)
        and not is_conditional(line)
    ]
    if exact_new:
        add(warnings, "DECISION REQUIRED plan declares exact new artifacts unconditionally; move decision-dependent files to CONDITIONAL ON DECISION: " + "; ".join(exact_new[:4]))


def check_completion_claims(text: str, warnings: list[str]) -> None:
    claims = re.findall(r"(?im)^.*\b(all|every|no legitimate|none remain)\b.*\b(analy[sz]ed|resolved|classified|incorporated|checked|remain|findings?)\b.*$", text)
    if claims and not re.search(r"\b\d+\s*/\s*\d+\b|exit code|WARNING \d+|No heuristic red flags found", text, re.I):
        add(warnings, "Broad completion claim found without explicit count/command evidence.")



def command_windows(text: str) -> list[tuple[str, str]]:
    """Return coarse command-oriented windows for sequencing heuristics."""
    starts = list(re.finditer(
        r"(?im)^\s*(?:#{2,6}\s+|[-*]\s+)?(?:\*\*)?`?(startShift|endShift|getActiveShift|"
        r"[A-Za-z0-9_ -]*(?:command|mutation|transition))(?:`|\*\*)?[^\n]*$",
        text,
    ))
    out: list[tuple[str, str]] = []
    for i, match in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else min(len(text), match.start() + 5000)
        out.append((match.group(1), text[match.start():end]))
    return out


def ownership_proof_pattern(resource: str) -> str:
    if resource == "shifts":
        return (
            r"self[- ]?own|own(?:ed|ership)|membership\.user_id|membership[^\n]{0,120}user_id|"
            r"shift[^\n]{0,120}(?:belongs|owned)|authenticatedUserId[^\n]{0,140}membership|"
            r"membership[^\n]{0,140}authenticatedUserId|authorize[^\n]{0,120}shift|"
            r"prove[^\n]{0,120}(?:shift|owner|membership)"
        )
    return (
        r"own(?:ed|ership)|belongs to|tenant scope|location scope|authorize|authorized|"
        r"resource scope|persisted scope|actor.*membership"
    )


def check_authorization_before_mutation(plan: str, warnings: list[str]) -> None:
    """Flag plans whose protected mutation can precede target authorization.

    This deliberately errs on the side of investigation. It distinguishes basic
    principal authentication from operation-specific authority over the target.
    """
    if not plan.strip():
        return

    mutation_re = re.compile(
        r"(?is)\b(UPDATE\s+(shifts|valet_sessions|vehicles|tasks|payments|refunds|incidents)\b|"
        r"DELETE\s+FROM\s+(shifts|valet_sessions|vehicles|tasks|payments|refunds|incidents)\b)"
    )
    for match in mutation_re.finditer(plan):
        resource = next((g for g in match.groups()[1:] if g), "resource")
        before = plan[max(0, match.start() - 1800):match.start()]
        after = plan[match.end():min(len(plan), match.end() + 1800)]
        proof_pat = ownership_proof_pattern(resource)

        # A guarded SQL statement can itself encode authorization. Inspect a
        # bounded statement-sized window for owner/user predicates or EXISTS/JOIN.
        statement = plan[match.start():min(len(plan), match.end() + 700)]
        guarded_in_write = bool(re.search(
            r"(?is)(WHERE|EXISTS|JOIN).{0,500}(user_id|actor_membership_id|membership_id).{0,240}"
            r"(authenticated|principal|user_id|membership_id)|"
            r"(authenticated|principal).{0,500}(user_id|membership_id)",
            statement,
        ))
        proof_before = bool(re.search(proof_pat, before, re.I | re.S))
        proof_after = bool(re.search(proof_pat, after, re.I | re.S))
        only_authentication_before = bool(re.search(
            r"authenticated user.{0,80}(?:active|valid)|require.{0,80}active user|resolve.{0,80}principal",
            before[-700:], re.I | re.S,
        )) and not proof_before

        if (proof_after and not proof_before and not guarded_in_write) or only_authentication_before:
            add(
                warnings,
                "Possible authorization-before-mutation violation: protected "
                f"{resource} mutation appears before operation-specific ownership/scope proof. "
                "Principal authentication alone is insufficient; prove target authority before mutation "
                "or encode the complete accepted authority predicate in the guarded write.",
            )
            break

    # Strong anti-pattern: success mutation first, ownership checked only in the
    # zero-row/fallback branch. This caught the real VAL-005B planning regression.
    if re.search(
        r"(?is)UPDATE\s+shifts.{0,900}(?:If\s+0\s+rows|0\s+rows\s+updated|zero[- ]row).{0,900}"
        r"(?:verif(?:y|ies)|prove|check).{0,180}(?:own|membership\.user_id|user_id)",
        plan,
    ):
        add(
            warnings,
            "Mutation-before-authorization anti-pattern: Shift UPDATE succeeds before self-ownership is proven; "
            "ownership is checked only in a zero-row/fallback path.",
        )


def check_retry_authorization(plan: str, warnings: list[str]) -> None:
    # Returning an already-completed protected resource is still a disclosure
    # decision and requires ownership/scope proof on the retry path.
    for m in re.finditer(r"(?is)(retry|already[- ]ended|already[- ]completed).{0,900}(return|returns).{0,220}(shift|resource|projection)", plan):
        block = plan[max(0, m.start() - 500):min(len(plan), m.end() + 700)]
        if not re.search(r"own(?:ed|ership)|belongs|membership\.user_id|authorize|authorized|persisted scope", block, re.I | re.S):
            add(warnings, "Retry/re-read path returns protected state without an explicit ownership/scope re-authorization proof.")
            break


def requirement_row_blocks(text: str) -> list[str]:
    starts = list(re.finditer(r"(?im)^\s*\|\s*(?:\*\*)?[RLDU]-?\d+|^\s*\|\s*(?:\*\*)?R\d+", text))
    if not starts:
        starts = list(re.finditer(r"(?im)^\s*\|\s*(?:\*\*)?[A-Z]\d+", text))
    out: list[str] = []
    for i, match in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else min(len(text), match.start() + 1600)
        out.append(text[match.start():end])
    return out


def check_lock_mechanism_provenance(text: str, warnings: list[str]) -> None:
    # Exact SQL lock primitives are implementation mechanisms unless an Accepted
    # Decision explicitly names them. Wrapped Markdown table rows are grouped so
    # `LOCKED` and `FOR SHARE` on adjacent visual lines are still associated.
    blocks = requirement_row_blocks(text)
    if not blocks:
        blocks = text.splitlines()
    for block in blocks:
        if not re.search(r"\bLOCKED\b", block):
            continue
        if re.search(r"\bFOR\s+(?:SHARE|UPDATE)\b|\bSERIALIZABLE\b|advisory lock|SKIP LOCKED", block, re.I):
            if not re.search(r"Accepted Decision[^|\n]*(?:exactly|explicitly|literal)|DEC-\d+[^|\n]*(?:requires|mandates)[^|\n]*FOR\s+(?:SHARE|UPDATE)", block, re.I):
                add(warnings, "Exact concurrency primitive is classified LOCKED without evidence that an Accepted Decision locks that literal mechanism; lock the property, derive/propose the repository-compatible mechanism.")
                break

def check_architecture_fidelity(facts: str, plan: str, warnings: list[str]) -> None:
    if not plan:
        return
    executor_evidence = bool(re.search(
        r"command executor|create[A-Za-z0-9_]*CommandExecutor|explicit command|"
        r"complete-check-in-command\.ts|intake-session-command\.ts|protected-custody-command\.ts",
        facts,
        re.I,
    ))
    service_owned_sql = bool(re.search(
        r"(?is)(?:ShiftCommandService|[A-Za-z0-9_]*CommandService|[A-Za-z0-9_]*Service).{0,1600}"
        r"(?:executes?|performs?|queries?|opens transaction|inTransaction).{0,500}"
        r"(?:UPDATE|INSERT|DELETE|SELECT|SQL|shifts)",
        plan,
    ))
    if service_owned_sql and not executor_evidence:
        add(warnings, "Plan assigns domain SQL/transaction ownership to a service without Repository-facts evidence from the nearest explicit command/executor implementation. Inspect the comparable command executor before selecting service-owned SQL.")
    elif executor_evidence and service_owned_sql:
        add(warnings, "Nearest repository pattern uses explicit command executors, but the plan places domain SQL/transactions directly in a service; justify the deviation or preserve the established thin-service -> command-executor architecture.")

    # New Nest modules must copy operational wiring from a nearest current module,
    # not just declare controllers/providers. Request ID/error/DB/Auth infrastructure
    # is easy to omit in planning.
    if re.search(r"shifts\.module\.ts|@Module\(|new .* module", plan, re.I):
        module_evidence = bool(re.search(r"\.module\.ts|RequestIdMiddleware|RuntimeDatabaseModule|HttpInfrastructureModule|AuthModule", facts, re.I))
        if not module_evidence:
            add(warnings, "New API module is proposed without Repository-facts evidence from a nearest current module's imports/middleware/infrastructure wiring (Auth, runtime DB, HTTP/request-ID). Inspect module composition before freezing files/providers.")


def check_symbol_provenance(facts: str, plan: str, warnings: list[str]) -> None:
    # Known repository-local helper names are not reusable unless exported. This
    # heuristic targets plans that reference a pre-existing helper symbol from a
    # new public-contract file without proving export/public ownership.
    reused = set(re.findall(r"\b([a-z][A-Za-z0-9_]*(?:Schema|Parser|Helper))\b", plan))
    for symbol in sorted(reused):
        if symbol in {"startShiftRequestSchema", "startShiftResponseSchema", "endShiftResponseSchema", "activeShiftResponseSchema", "shiftProjectionSchema"}:
            continue
        if symbol not in facts:
            continue
        # If facts mention the symbol but not its export, require proof before use
        # from another file. `const fooSchema` is not package API.
        fact_window = facts[max(0, facts.find(symbol)-180):facts.find(symbol)+260]
        if not re.search(rf"export\s+(?:const|function|class|type)\s+{re.escape(symbol)}|public export|re-export", fact_window, re.I):
            if re.search(rf"(?:uses?|with|:\s*)[^\n]{{0,220}}\b{re.escape(symbol)}\b", plan, re.I):
                add(warnings, f"Plan reuses `{symbol}` without Repository-facts proof that the symbol is exported/public from its declaring module. Verify export provenance or define an appropriately owned local/shared equivalent.")
                break


def check_error_semantic_fidelity(text: str, warnings: list[str]) -> None:
    # Concealment is an HTTP behavior, not permission to lie about which domain
    # authorization failed. This check is intentionally narrow to the stale-shift
    # cleanup pattern that exposed the regression.
    if re.search(r"self[- ]end", text, re.I) and re.search(r"(?:LocationAccess|location access).{0,140}(?:not required|not require|is not required)|without requiring.{0,80}(?:LocationAccess|location access)", text, re.I | re.S):
        if re.search(r"(?is)(?:foreign|different user|not owned|non-owned).{0,240}LOCATION_ACCESS_DENIED", text):
            add(warnings, "Possible semantic error mismatch: self-end does not require LocationAccess, yet non-ownership is mapped to LOCATION_ACCESS_DENIED. Preserve non-disclosure without inventing a false permission failure.")




def check_production_evidence_claims(text: str, warnings: list[str]) -> None:
    """Catch common evidence inflation observed in production-oriented agent work."""
    low = text.lower()

    # Typecheck is not lint.
    if re.search(r"(?is)(?:lint|linting).{0,180}(?:tsc\s+--noemit|tsc\s+--no-emit)", text):
        add(warnings, "Evidence inflation: `tsc --noEmit` is typechecking, not linting. Configure/run a real linter or label the gate accurately.")

    # Schema synchronization is not versioned migration proof.
    if re.search(r"(?is)(?:migration|migrations).{0,220}(?:prisma\s+db\s+push|db\s+push)|(?:prisma\s+db\s+push|db\s+push).{0,220}(?:migration|migrations)", text):
        add(warnings, "Evidence inflation: schema synchronization (`db push`) is not versioned migration verification. Require migration artifacts and clean/existing-data migration execution.")

    # Docker build/configuration cannot support a runtime-success claim by itself.
    docker_claim = re.search(r"(?is)docker.{0,120}(?:runtime|stack|compose|containers?).{0,120}(?:pass(?:ed)?|verified|works?|healthy|running)", text)
    runtime_evidence = re.search(r"(?is)docker(?:-compose|\s+compose)\s+up|docker(?:-compose|\s+compose)\s+ps|docker\s+logs|/health|/ready|curl\s+http|invoke-restmethod|invoke-webrequest", text)
    if docker_claim and not runtime_evidence:
        add(warnings, "Docker runtime success is claimed without runtime evidence such as Compose startup, container state/health, endpoint exercise, or logs.")

    # Workflow configuration/local commands are not an observed remote CI run.
    ci_claim = re.search(r"(?is)(?:github actions|remote ci|ci workflow).{0,160}(?:pass(?:ed)?|successful|green|verified)", text)
    ci_remote_evidence = re.search(r"(?is)(?:actual|remote) (?:github actions|ci) run|workflow run #|run id|github actions.*executed", text)
    if ci_claim and not ci_remote_evidence:
        add(warnings, "Remote CI success is claimed without evidence that the actual GitHub Actions/remote CI run executed. Distinguish configured/local verification from remote pass.")

    # Hard-crash recovery cannot rely on cleanup code in the dead process.
    if re.search(r"(?is)(?:sigkill|kill\s+-9|oom|hard crash).{0,600}(?:nack|cleanup|requeue)", text) and not re.search(r"(?is)(?:lease|visibility timeout|stalled[- ]job|orphan.*sweep|independent recovery|locked_by|lease_expires)", text):
        add(warnings, "Hard-crash recovery appears to depend on cleanup/requeue behavior without an independent lease/visibility/stalled-job recovery mechanism.")

    # READY should be downgraded when the same plan explicitly retains critical production conditions.
    ready = re.search(r"(?im)^\s*(?:#+\s*)?(?:\*\*)?READY(?:\*\*)?\s*$", text)
    residual = re.search(r"(?is)(remaining production risk|dns rebinding|egress proxy|must be deployed behind|required in production|known production condition|not verified in production)", text)
    if ready and residual:
        add(warnings, "Production-readiness claim is `READY` while the plan/report also states a material remaining production condition/risk. Consider `READY WITH CONDITIONS` or `NOT READY` based on severity.")

def main() -> int:
    if len(sys.argv) != 2:
        print("usage: audit_plan.py <plan.md>")
        return 2
    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"ERROR: plan file not found: {path}")
        return 2
    text = path.read_text(encoding="utf-8")
    warnings: list[str] = []

    omega_mode = has_heading(text, "DECISION FIREWALL") or has_heading(text, "Candidate requirement classification")
    if not omega_mode:
        for name in STANDARD_SECTIONS:
            if not has_heading(text, name):
                add(warnings, f"Required section missing: {name}")

    check_classifications(text, warnings)
    check_proposition_polarity(text, warnings)
    check_absence_as_contradiction(text, warnings)

    unresolved = section_any(text, ["UNRESOLVED decisions", "Unresolved decisions"])
    plan = section_any(text, ["Proposed implementation plan", "Conditional implementation envelopes"])
    tests = section_any(text, ["Test matrix", "Test-purity matrix"])
    files_text = section_any(text, ["Files expected to change", "File-change prediction"])
    verdict = section_any(text, ["Ready-to-implement verdict"])
    facts = section_any(text, ["Repository facts discovered"])
    if not verdict:
        # Fallback for custom output that has final verdict as a plain final line.
        verdict = text[-1000:]

    later_sections = after_section(text, "UNRESOLVED decisions")
    check_decision_leakage(
        unresolved,
        {"later sections": later_sections, "plan": plan, "tests": tests, "files": files_text},
        warnings,
    )

    if re.search(r"DECISION REQUIRED", verdict, re.I):
        definitive = [line for line in plan.splitlines() if selected_line(line)]
        if len(definitive) >= 4:
            add(warnings, "DECISION REQUIRED verdict has many definitive implementation statements; keep the implementation section conditional and tied to U-IDs.")

    check_route_evidence(facts, plan, warnings)
    check_authorization_before_mutation(plan, warnings)
    check_retry_authorization(plan, warnings)
    check_lock_mechanism_provenance(text, warnings)
    check_architecture_fidelity(facts, plan, warnings)
    check_symbol_provenance(facts, plan, warnings)
    check_error_semantic_fidelity(text, warnings)
    check_concurrency_completeness(text, warnings)
    check_free_text_security(text, warnings)
    check_falsification(text, warnings)
    check_artifact_leakage(unresolved, verdict, files_text, warnings)
    if re.search(r"DECISION REQUIRED", verdict, re.I):
        for m in re.finditer(r"\b((?:evaluate|check|require|resolve|build)[A-Z][A-Za-z0-9_]{3,})\s*\(", later_sections):
            symbol = m.group(1)
            if symbol not in facts and not is_conditional(later_sections[max(0, m.start()-120):m.end()+120]):
                add(warnings, f"DECISION REQUIRED plan selects exact new function/interface `{symbol}(...)` without repository evidence that this exact symbol is locked; keep signature conditional.")
                break
    check_completion_claims(text, warnings)
    check_production_evidence_claims(text, warnings)

    selected_scope = "\n".join([
        section_any(text, ["DERIVED conclusions"]),
        plan, tests, later_sections,
    ])
    if re.search(r"\bP2002\b", selected_scope) and re.search(r"raw SQL|PostgresTransaction|\bpg\b|postgres", selected_scope, re.I):
        add(warnings, "P2002 appears in selected/derived behavior for a raw PostgreSQL path; prove the mutation actually uses Prisma Client.")

    if re.search(r"eligib|availability", text, re.I) and re.search(r"assign|dispatch|end shift|revok", text, re.I):
        if not re.search(r"check[- ]use|TOCTOU|consumer transaction|later write|predicate.*false|invalidat", text, re.I | re.S):
            add(warnings, "Eligibility/assignment is discussed without an explicit check-use invalidation analysis or consumer transaction contract.")

    identity_scope = "\n".join([facts, section_any(text, ["LOCKED decisions"]), section_any(text, ["DERIVED conclusions"]), plan])
    if re.search(r"unique index.*membership_id|membership_id.*unique", identity_scope, re.I | re.S):
        if re.search(r"\b(one|max(?:imum)? 1|single) active shift\b.*\b(per user|platform[- ]wide|globally for (?:a )?user)\b", identity_scope, re.I | re.S):
            add(warnings, "Possible identity-scope collapse: membership-scoped uniqueness is described as user-global uniqueness in facts/derived/selected behavior.")

    audit_selected = plan + "\n" + tests
    if re.search(r"audit event|event name|audit writer", unresolved, re.I) and re.search(
        r"(?:audit|event|emit).{0,100}\bSHIFT_[A-Z0-9_]+\b|\bSHIFT_[A-Z0-9_]+\b.{0,100}(?:audit|event|emit)",
        audit_selected,
        re.I | re.S,
    ):
        add(warnings, "Exact SHIFT_* audit event names appear after audit/event semantics were marked unresolved.")

    if re.search(r"\b(start|end|create|update|insert|post|put|patch)\b", plan, re.I):
        retry_terms = ["first", "identical retry", "concurrent identical", "conflicting", "retry after"]
        missing = [t for t in retry_terms if t not in tests.lower() and t not in text.lower()]
        if missing:
            add(warnings, "Mutation retry/concurrency matrix may be incomplete; missing concepts: " + ", ".join(missing))

    checks = [
        (r"/api/v1/", "Selected route contains /api/v1; verify actual application prefix rather than stakeholder wording."),
        (r"currentAssigneeMembershipId|current_assignee_membership_id", "Current assignee appears in selected/later behavior; verify it is not promoted to canonical Task ownership."),
        (r"shifts\.contracts\.ts", "Module-local public contracts are selected/proposed; verify shared-contract convention."),
        (r"repository\.ts", "Repository layer is selected/proposed; verify nearest command/executor architecture."),
        (r"(?:zero|0)\s+(?:schema\s+)?migrations|no\s+(?:database\s+|schema\s+)?migration(?:s)?\s+(?:are\s+)?required", "Final no-migration claim found; ensure unresolved persistence choices cannot change it."),
    ]
    for pat, msg in checks:
        if re.search(pat, selected_scope, re.I):
            add(warnings, msg)

    warnings = unique(warnings)
    print(f"VAYLET plan audit v{VERSION}: {path}")
    if not warnings:
        print("No heuristic red flags found. This is not proof the plan is semantically correct.")
        return 0
    for i, warning in enumerate(warnings, 1):
        print(f"WARNING {i}: {warning}")
    print("Re-evaluate each warning against Accepted Decisions, binding docs, exact proposition polarity, helper capability, identity scope, and transaction semantics.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
