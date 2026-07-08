# skillwright — competitive & prior-art landscape (2026-07)

Synthesis of a 5-track research fan-out into the OSS landscape, to steal good
ideas and avoid known traps. Sources' full reports are at the bottom.

## What the landscape validates (we're on the right track)

- **Extension-connects-out CDP relay** is the *proven* pattern (playwright-mcp,
  real-browser-mcp) — the extension is the CDP client dialing a CLI-hosted WS,
  never a server. Ours matches.
- **Chrome 136 killed `--remote-debugging-port` on the default profile**, so
  `chrome.debugger` is the only sanctioned route to the real profile. Confirmed;
  our whole relay premise is correct.
- **Install-by-symlink into `.claude/skills` + `.agents/skills`** matches the
  emerging `openskills` convention. Our install model is idiomatic.
- **The 3-tier determinism ladder + quarantine-promote self-healing** is
  genuinely differentiated — others do pieces in isolation (DevTools Recorder =
  tiers 1–2; Skyvern/browser-use = tier 3 only; Playwright's Healer fixes but
  doesn't gate promotion on repeated clean runs).
- **Redaction-before-disk, local-first, secrets-never-to-LLM** are exactly the
  trust table-stakes a security-conscious user expects. We meet them.

## Steal — prioritized, mapped to concrete changes

### High leverage
1. **Effect tags from observed network traffic ("Tier 0").** Watch the CDP
   Network domain during capture/replay: `GET` → readonly, `POST/PUT/DELETE` →
   mutating/destructive. A **non-LLM** effect signal — directly hardens the one
   accepted residual risk (LLM-inferred tags). Feed it into the existing
   `roundUpEffect([...])` fusion as another floor. *(safety agent)*
2. **A deterministic heal tier (Tier 2.5) before the agentic one.** Healenium
   (DOM tree LCS) and a 2026 "zero-cost a11y healing" paper heal via cheap
   similarity scoring with a `score-cap` threshold; escalate to the LLM only
   below the cap. Cheaper, faster, more deterministic than always-LLM heal.
   *(self-healing agent)*
3. **Stable extension ID via a hardcoded manifest `key`.** playwright-mcp pins
   its ID; it's load-bearing for WS `Origin` validation + token auth. Pin ours
   and validate `Origin: chrome-extension://<id>` on the WS upgrade alongside the
   constant-time token. *(extension agent)*
4. **WebSocket-as-keepalive + `chrome.alarms` heartbeat + auto-reconnect.** SW
   death silently dropping the relay is the #1 MV3 failure mode. A killed worker
   must re-dial and re-attach the debugger. *(extension agent)*

### Medium leverage
5. **a11y-tree as the canonical semantic form + an ID→XPath map** (Stagehand):
   distill against role+name, keep stable IDs for LLM reasoning while replay
   stays deterministic. Survives restyling; cleaner intent labels. *(self-healing)*
6. **Blast-radius plan preview** (Terraform-style): before a run, print "3
   readonly · 1 mutating · 1 destructive — proceed?" and gate on the aggregate;
   optional cap that aborts if destructive count exceeds a baseline. Great UX
   *and* safety, and demo-friendly. *(safety)*
7. **Also ship an MCP wrapper** for `replay.ts` so tool-consuming agents
   (LangGraph, OpenAI, SK) can call the replay. Skill = discovery/instructions,
   MCP = executable runtime — do **both**, they don't compete. *(skills agent)*
8. **Redaction upgrades**: entropy detection (Base64 >4.5 bits/char, hex);
   categories we likely miss — `Authorization`/`Cookie` headers, `Basic
   base64(user:pass)`, connection strings (`postgres://user:pass@…`), JWTs in
   local/sessionStorage, CSRF tokens, secrets in POST bodies; keyword-proximity
   redaction. Add adversarial fixtures per category. *(safety)*
9. **Sign `recording.json` + manifest** (A2A Agent Cards do signed descriptors).
   No skill-signing standard exists yet — an opportunity to *lead* on provenance.
   *(skills agent)*
10. **Idempotency/double-send fingerprint** (method+URL+body hash): make the
    partial-execution guard provable, surface "uncertain, needs human" instead of
    a silent skip. *(safety)*

### Low-cost / hygiene
11. **`skillwright validate`** wrapping `skills-ref validate` so every emitted
    skill is provably spec-conformant. *(skills)*
12. **Namespace our frontmatter under `metadata.*`** (the spec reserves it for
    client extensions) and adopt `allowed-tools` + `compatibility` for declared
    permissions — behind an adapter (both are Experimental). *(skills)*
13. **Recorder capture heuristics**: auto viewport+navigate steps, ~400ms hover
    debounce, a11y snapshots as selectors. *(extension)*

## Avoid (traps others revealed)

- **Persisting volatile element indices** (browser-use re-derives them each step)
  — bind to role+name/XPath, never an index.
- **LLM in the replay hot path** — slow, flaky, costly; keep it off the happy
  path (our ladder already does).
- **Absolute/positional XPath** — brittle; prefer ancestor-relative (Robula+).
- **Unverified single heals silently drifting** — quarantine + score thresholds
  are essential (Healenium's own guidance).
- **No WS auth** (real-browser-mcp ships none → local malware can drive the
  browser). Keep our token + origin pin.
- **`Browser.*` CDP domains don't forward through `chrome.debugger`** (e.g.
  `setDownloadBehavior`) — design around the tab-level ceiling.
- **Thin single-framework wrappers age out** (LaVague now dormant) — stay
  agent-agnostic.
- **Standard churn** (MCP re-specs fast; `allowed-tools` Experimental) — isolate
  behind adapters; track Linux Foundation / AAIF governance.

## Competitive read

Closest: **Chrome DevTools Recorder / @puppeteer/replay** (record → portable
multi-selector script) and **Playwright's 2026 Planner/Generator/Healer agents**
(record → semantic rewrite → self-heal). The latter is the one to watch — it's
converging on our capture+heal loop.

skillwright's durable moat: **compile-once from a single human demo into a
portable Agent Skill that is both a deterministic script AND agent-readable
instructions**, healed via **quarantine-and-promote**, run against the user's
**real authenticated Chrome**. No one ships that exact dual artifact today.

## Launch playbook (condensed)

- **Hero demo = a 20–40s two-pane GIF** (browser demonstrated once | CLI
  capturing), then a *second agent replaying the generated skill*. Autoplays
  inline on GitHub. Secondary: an asciinema CLI cast. Show the **generated
  SKILL.md** — the portable artifact is the moat.
- **One benchmarkable claim above the fold** (uv-style): self-heal success rate
  or "first success <60s".
- **First success <60s**, copy-pasteable.
- **Launch:** Show HN Tue–Thu ~8am ET ("Show HN: skillwright – turn a browser
  task you demo once into a portable agent skill"), r/LocalLLaMA + X thread with
  the GIF, Discord + `good-first-issue`s staged, founder present all day.

---

## Source reports

<details><summary>Track 1 — semantic record-replay & self-healing</summary>

Key: multi-selector fallback capture (Chrome Recorder); a11y-tree canonical form
+ ID→XPath map (Stagehand); cache-key validation before reuse (Midscene);
deterministic heal before LLM (Healenium LCS, zero-cost a11y paper); score-cap +
recovery-tries thresholds; heal-verify by role match + functional effect;
record-then-LLM-rewrite (Playwright); healer as separate verification agent.
Competitors: DevTools Recorder, Playwright agent suite (narrowing).
</details>

<details><summary>Track 2 — agent skill formats, portability & distribution</summary>

Adopt SKILL.md verbatim, extend under `metadata.*`; `allowed-tools` +
`compatibility` for permissions; MCP metaregistry pattern (don't host bundles);
two-layer versioning (semver + SHA pin); `openskills` symlink convention matches
ours; sign recording.json (A2A); bundle `skillwright validate`. Emit Skills as
primary AND expose an MCP wrapper. Track Linux Foundation / AAIF governance.
</details>

<details><summary>Track 3 — Chrome extension + CDP patterns</summary>

Extension-connects-out (playwright-mcp, real-browser-mcp); stable ext ID via
manifest `key` + Origin check; token in connect URL + constant-time compare;
WS-as-keepalive + chrome.alarms + reconnect; tab-level `chrome.debugger.attach` +
`Input.dispatch*` for trusted input; sidePanel pairing UI; `Browser.*` CDP
ceiling. Web Store: `debugger` is sensitive but approvable (real-browser-mcp
shipped); playwright-mcp stays private/GitHub-Release. Alternatives: unpacked,
enterprise force-install, self-hosted crx, DevTools-panel (loses trusted input).
</details>

<details><summary>Track 4 — OSS launch craft & DX</summary>

Exemplars: uv/ruff (benchmarkable hook), Aider (dogfooding trust stats),
browser-use (action hook + code above fold), Stagehand (frames against
Playwright), tRPC (playground), Bruno (values wedge). README: hook → badges →
hero demo → 60s quickstart → show the artifact → social proof → why/how. Demo:
two-pane GIF hero + asciinema secondary + hosted playground aspirational. Launch:
Show HN Tue–Thu AM, engaged founder presence, Discord + good-first-issues.
</details>

<details><summary>Track 5 — safety gates & secret handling</summary>

Effect gate: blast-radius plan preview (Terraform); policy-as-code
allowlist/denylist (never_auto); server-side dry-run / derive effect from
network traffic; gate only destructive + first-time-seen (Operator); idempotency
keys; audited bypass (GitHub). Redaction: entropy detection; prefix-anchored
token regexes; missed categories (Authorization/Cookie/connection-strings/JWTs-
in-storage/POST bodies); keyword-proximity; consistent placeholders + allowlist.
Table stakes: redaction before disk, local-first, no secrets to LLM, auditable
action log, inspectable+overridable tags, dry-run/kill-switch, no silent retries.
</details>
