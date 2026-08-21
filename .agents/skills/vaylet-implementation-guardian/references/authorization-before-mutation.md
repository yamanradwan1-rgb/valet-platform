# Authorization Before Mutation — Implementation Gate

Before coding any protected mutation, write down its authority predicate from the Accepted Decision. Then ensure code proves that predicate before protected state can change.

## Safe execution order

`authenticate -> resolve persisted target/scope -> authorize target/operation -> lock/protect -> mutate -> audit -> commit`

The first three stages are distinct. An authenticated active User may still have no authority over the target row.

## Code review questions while implementing

- Can an attacker who knows another resource UUID reach a mutation before ownership/scope is checked?
- Does a `RETURNING` row expose or mutate a target before authorization?
- Does a zero-row fallback check authorization only after a different row could already have been changed?
- Is ownership encoded safely in the guarded SQL predicate, or was it proven on a locked authoritative row beforehand?
- Is the proof kept valid until the write commits?
- Do retry/re-read paths re-authorize before returning protected state?
- Does error mapping preserve concealment without using a semantically false authorization condition?
- Does audit attribution come from the already-authorized persisted actor/scope?

Transaction rollback is not a substitute for authorization ordering. The implementation must not intentionally perform unauthorized writes and depend on a later check to roll them back.
