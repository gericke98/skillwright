# Recording real-world tasks

A field guide to capturing your actual day-to-day browser tasks with skillwright
and replaying them reliably. Everything here is grounded in the pipeline's real
behavior (and the bugs fixed getting it there), not aspiration.

## 0. Preflight

```bash
skillwright doctor
```

Confirms Node, an LLM backend (a `claude`/`codex`/`gemini` CLI on PATH, or
`SKILLWRIGHT_API_KEY` for the direct Anthropic API), a writable skill library,
and Chromium for the `--cdp` path. Fix any `✗` before recording — a missing
backend means `distill --semantic` can't run.

## 1. What captures cleanly

The recorder handles the interactions that make up most real tasks:

| Interaction | Notes |
|---|---|
| Click (buttons, links, rows) | Selector stack prefers `aria/` → test attrs → id → stable text over brittle CSS paths. |
| Typing into inputs/textareas | Captured as the field's final value on change; secrets are redacted. |
| Checkboxes & radios | Captured as the resulting **checked state**, replayed with `setChecked`. |
| Native `<select>` | Replayed with `selectOption`, not `fill`. |
| Contenteditable / rich-text (Gmail, Slack, Notion) | Captured on blur; replayed by setting text. |
| File uploads | Captured as a required `{file}` input — pass the path at run time (see §4). |
| Keyboard (Enter, Tab, Escape, arrows, shortcuts) | Captured; plain typing rides the field value instead. |
| Shadow DOM | Pierced on capture (`composedPath`) and replay. |
| Same-origin iframes | Captured (all-frames) and resolved on replay. |

## 2. Selectors: why your skill survives UI changes

Each step records a **stack** of selectors, most-stable first, and replay falls
through them until one resolves. Author-friendly anchors (`aria-label`,
`data-testid`, visible text) rank above positional CSS paths, and selectors that
uniquely identify the target rank above ambiguous ones. If a stack goes stale,
tier-3 heal can re-derive a selector from an ARIA snapshot; a healed selector is
quarantined and only promoted to canonical after repeated clean runs
(`skillwright promote <skill>`).

Practical tip: sites with stable `aria-label`s or `data-testid`s replay most
reliably. Auto-generated class names (`.css-1a2b3c`) are treated as last-resort.

## 3. Slow apps and async content

Real apps are slower than a test fixture. Replay auto-waits for elements to
appear and become interactable, but the default per-step timeout is 3s. For a
slow SPA/backend, raise it:

```bash
skillwright run <skill> --cdp <url> --timeout 15
```

## 4. Parameterized values (and file uploads)

Values the distiller recognizes as inputs become `{placeholder}`s. Supply them
at run time; a missing required input fails fast before the browser opens:

```bash
skillwright run approve-invoice --input invoice_number=INV-2042
skillwright run attach-receipt  --input file=/abs/path/receipt.pdf
```

File uploads work on the **`--cdp`** path (via `setInputFiles`). The relay path
can't set a file input from page JS in v1 — use `--cdp` for upload flows.

## 5. Relay vs. `--cdp`

- **Relay** (`skillwright relay`, pair in the side panel) — drives your real,
  already-authenticated Chrome. Best for tasks behind a login. Limitation: no
  file upload, and cross-origin iframes aren't reachable from the in-page relay.
- **`--cdp <url>`** — attach to a debug-profile Chrome (`--remote-debugging-port`)
  or CI Chromium. Supports file upload and cross-origin iframes (Playwright
  bypasses the same-origin boundary). Set `CHROME_CDP_URL` to skip the flag.

## 6. Safety

- Steps are effect-tagged (readonly / mutating / **destructive**). Destructive
  steps (Delete, Pay, Send…) require `--confirm-destructive`; the effect floor is
  derived from the HTTP method a step fired, so it can't be talked down by a
  mis-inferred label. A mutating/destructive API-replay that fails never silently
  falls back to the DOM (no double-send).
- Secrets are redacted at capture time and again during distillation. Recordings
  stay local; nothing is uploaded.

## 7. Consuming the skill from any agent

- **Any SKILL.md reader** (Claude Code, Cursor): `skillwright install <skill> --project .`
- **Script mode** (any agent, incl. Codex): `skillwright run <skill>`
- **MCP tool-callers** (OpenAI, LangGraph, …): `skillwright mcp` exposes every
  installed skill as an MCP tool (verified against the official MCP SDK client).

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `all selectors exhausted` | The element didn't resolve. Raise `--timeout`; check the page reached the expected state; a heal may re-derive it. |
| `needs-confirmation` | A destructive step — re-run with `--confirm-destructive` once you've reviewed it. |
| `missing required input(s): …` | Pass them with `--input name=value`. |
| Extension "did not connect" | Open the side panel, set the relay port + token, click Connect. |
| `distill --semantic` does nothing useful | No LLM backend — run `skillwright doctor`; install a CLI or set `SKILLWRIGHT_API_KEY`. |
| File upload fails on the relay | Use the `--cdp` path (§4/§5). |

Hit something not covered here? That's a bug worth filing — paste the
`skillwright run` output into an issue.
