# Git/worktree execution safety

- Work only on the task-owned branch.
- Never implement directly on `main`/`master`.
- Inspect working-tree changes before editing.
- Treat pre-existing local changes as user/agent work that may be valuable.
- Do not reset, restore, clean, stash, checkout-over, or discard them automatically.
- Do not have two agents edit the same working tree concurrently.
- Use a separate clone/worktree/branch for genuine parallel work.
- Fetch/reconcile `origin/main` only when it is safe for the current working tree and repository workflow.
- Avoid rebase/force-push on shared feature branches unless explicitly authorized.
- Inspect staged diff before commit.
- Push only the owned branch.
- PR CI and independent review govern merge; successful local tests alone are not merge authority.
