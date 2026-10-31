# Feature: pasted HTML table conversion

- [x] `how` over the affected table discovery and conversion subsystem.
- [x] `architect` for parallel design exploration.
- [x] Write the throughput checkpoint as four todo items.
  - [x] **Blocking first steps.** Preserve Typora's node model, native undo, and existing `enable()` validation.
  - [x] **Independent workstreams.** Clipboard parsing and the shared conversion transaction affect the same entry point and serialize.
  - [x] **Shared mutable state.** The current paragraph node remains the only writer-owned document state.
  - [x] **Smallest safe decomposition.** One implementation owner is safest because extraction and its tests share the native snapshot transaction.
- [ ] Delegate code-writing to a subagent using your configured feature model. skip: the runtime does not provide isolated worktrees; parent owns the serialized diff.
- [x] Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it. Type check and four focused suites pass. The editor suite reaches the pre-existing raw-HTML Enter assertion after all new paste assertions pass.
- [x] Rebase into small, ordered commits. Stack follow-ups. skip: no commit or PR was requested.
- [x] If the design is contested, `interrogate` before shipping. skip: the design review converged on one conversion and one mount path.
- [x] Run **Opening a PR**. skip: the user did not request a PR.

## ub-mode action log

| Action                                               | Reason                                            | Result                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Read discovery, input, and conversion paths          | Identify one owner for persisted table state      | `enable()` is the only controller mount point                                               |
| Compared typed and clipboard entry routes            | Avoid a global input buffer and direct DOM writes | Both routes will reuse a native node conversion transaction                                 |
| Added a standalone-table paste test                  | Pin paste ownership before implementation         | It failed because paste was initially passed through                                        |
| Reviewed the diff independently                      | Find ownership and validation gaps                | Rejected paste outside the writing area and invalid table grids before cancelling the event |
| Re-ran type and focused tests after the review fixes | Confirm the repaired boundaries                   | Type check passes; new assertions run before the existing raw-HTML test failure             |
