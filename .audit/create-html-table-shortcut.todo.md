# Feature: create HTML table shortcut

- [x] `how` over the affected subsystem.
- [x] `architect` for parallel design exploration.
- [x] Write the throughput checkpoint as four todo items.
  - [x] **Blocking first steps.** Inspect the existing creation and command paths before changing code.
  - [x] **Independent workstreams.** Command title and documentation are independent; the implementation and its behavioral test share `src/main.ts` and `test/editor.mjs` and will be serialized.
  - [x] **Shared mutable state.** The plugin's document state remains owned by the existing creation method; no new shared state is introduced.
  - [x] **Smallest safe decomposition.** One owner is best because the shortcut must reuse the existing native-undo conversion transaction.
- [x] Delegate code-writing to a subagent using your configured feature model (default in poteto-mode's Models section) with a specific scope (file paths, named data shape and its organizing structure per **principle-model-the-domain**, a state machine over scattered booleans, a table/registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, and success criteria). skip: the agent concurrency limit rejected a write delegate; the parent implemented the reviewed sketch.
- [x] Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it. Type check and four focused suites pass; `test/editor.mjs` is blocked by the existing raw-HTML assertion.
- [x] Rebase into small, ordered commits. Stack follow-ups. skip: no commit or PR was requested.
  Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
- [x] If the design is contested, `interrogate` before shipping. skip: reusing the tested existing conversion transaction has no competing design with different user-visible behavior.
- [ ] Run **Opening a PR**. skip: the user did not request a PR.

## ub-mode action log

| Action                                                                     | Reason                                                     | Result                                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Inspected command registration, table creation, tests, locales, and README | Find the smallest complete change and all callers          | Existing `createTable` owns conversion and undo safely                                        |
| Added a red test for shortcut creation and text preservation               | Pin user-visible behavior before implementation            | It failed because the new command was not registered                                          |
| Reused the conversion transaction for a command path                       | Preserve Typora model, native undo, and rollback ownership | Command creates only from an empty focused paragraph                                          |
| Ran checks                                                                 | Verify the changed artifact                                | Type check passed; the editor test is blocked by its pre-existing raw HTML creation assertion |
| Reviewed the diff independently                                            | Check for data-loss regressions                            | Rejected whitespace-only paragraphs and added a regression assertion                          |
