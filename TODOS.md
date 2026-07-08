# TODOS

## skillwright prune — bound screenshot disk growth
- **What:** A `skillwright prune` command that drops per-step screenshots for old/superseded skill versions while keeping `assets/recording.json` (immutable evidence) intact.
- **Why:** Every recorded step stores a screenshot in `assets/screenshots/`. Across a growing library over months, that's unbounded local disk with no reclamation path.
- **Pros:** Keeps `~/.skillwright/` bounded; predictable footprint.
- **Cons:** Premature before a meaningful library exists; adds a command surface to maintain.
- **Context:** Surfaced in the /plan-eng-review performance pass (2026-07-06). Not a v1 blocker — local disk is cheap and the problem only bites after heavy use. `recording.json` must never be pruned (it's the evidence artifact); only version-superseded screenshots are candidates.
- **Depends on:** nothing. Natural home is post-v1 (after M4).

## Environment-precondition contract (outside-voice finding)
- **What:** A declared set of preconditions per skill (account state, feature flags, locale, viewport, nav layout, landing context) checked before replay.
- **Why:** Without it, precondition failures (wrong account state, feature flag off) get misdiagnosed as selector drift and "healed" incorrectly — the heal loop papers over a real mismatch.
- **Context:** Codex outside-voice finding, /plan-eng-review 2026-07-06. Interacts with the quarantine model (D18): a heal firing on a precondition failure is exactly the kind of wrong-but-passing fix quarantine is meant to catch, but a precondition check would prevent the bad heal from ever running.
- **Depends on:** effect-tag/heal infra (M3). Candidate for M3 or a fast-follow.

## Human/agent concurrency model on the live profile (outside-voice finding)
- **What:** A tab-ownership / session-lock model for when `skillwright run` drives the user's live profile while the user may also be using it.
- **Why:** Real operational hazard — automation and human acting in the same profile concurrently, especially dangerous on destructive workflows.
- **Context:** Codex outside-voice finding, /plan-eng-review 2026-07-06. v1 mitigation could be as small as "warn + require a dedicated tab"; full model is post-v1.
- **Depends on:** relay (M1) for tab attach semantics.

## install: copy-fallback reconciliation (outside-voice finding)
- **What:** A reconciliation story for when `skillwright install` falls back from symlink to copy (Windows, restricted FS).
- **Why:** After a copy, global-library heal promotions no longer propagate to the installed location and local edits diverge silently — the spec currently treats copy as equivalent to symlink.
- **Context:** Codex outside-voice finding, /plan-eng-review 2026-07-06. At minimum, `skillwright list`/`skillwright install` should detect copy-mode installs and flag them as stale-able, with a `skillwright sync` to refresh.
- **Depends on:** install (M4).

## Relay robustness on real auth flows (outside-voice finding, risk note)
- **What:** Validate/​handle popups, SSO windows, file pickers, downloads, WebAuthn/MFA, cross-origin iframes, print dialogs, multi-tab flows through the CDP relay.
- **Why:** Tab-scoped `chrome.debugger` bridged to browser-level CDP is brittle; the "real day-to-day Chrome" promise weakens on exactly the enterprise flows that are the target use case.
- **Context:** Codex outside-voice finding, /plan-eng-review 2026-07-06. Not a TODO to build up front — a risk to probe DURING M1 with a fixture that exercises at least a popup + a cross-origin iframe, so the brittleness is measured, not assumed.
- **Depends on:** M1 relay.
