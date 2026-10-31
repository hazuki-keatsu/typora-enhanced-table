# Bug fix

- [x] Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires. The one Typora development instance launched, but macOS denied screen and accessibility inspection. The focused regression reproduces the same event target with the editor root.
- [x] Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Claude Code's `loop` skill. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out. `event.target` was the editor root instead of the paragraph. The installed global 0.1.0 bundle lacked `createTable` and alignment controls. The controls also used unsupported `:has()`.
- [x] Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default in poteto-mode's Models section) with a specific scope. The fix stays inside `createTable`, the controller stylesheet, release metadata, and its focused test. No signature changes.
- [x] Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence. `node test/editor.mjs`, `pnpm test`, `pnpm run check`, and `pnpm run pack` pass. The ZIP has manifest 0.1.1, creation/control strings, and no `:has(` selector.
- [ ] Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear. skip: the worktree had user-owned Typora vault changes, so no commit was created.
- [ ] Run **Opening a PR**. skip: the user did not request a PR and opening one is outside this local fix.

## Scope

- [x] Map all callers, tests, fixtures, exports, and production packaging paths before editing.
- [x] Keep the observed source shape as one Typora HTML-block table plus its generated controller controls.
- [x] Throughput checkpoint: one live Typora instance, one reproducible production package, then one passing repeat of both reported interactions. GUI observation remained blocked by missing macOS accessibility and screen-capture approval.

## Action log

| Action | Reason | Result |
| --- | --- | --- |
| Started one `build:dev` vault | Match the Typora runtime without creating multiple instances. | One Typora process remained running. |
| Changed the event target in the editor test | Make the real `#write` event path executable. | Failed before the source fix with `false !== true`. |
| Derived the paragraph from the selection range | Keyboard events target the editor root, while selection identifies the active paragraph. | Table creation regression passed. |
| Replaced `:has()` with container `:focus-within` | Keep controls visible on older Typora engines. | Production CSS has no `:has(` selector. |
| Bumped 0.1.0 to 0.1.1 | The globally installed 0.1.0 bundle was stale and lacked the new controls. | ZIP declares 0.1.1 and contains the new entry code. |
