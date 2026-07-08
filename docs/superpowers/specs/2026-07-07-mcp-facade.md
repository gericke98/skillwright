# MCP facade — skills as tools for any agent

**Goal:** make skillwright skills consumable by **any** agent, not just ones that
read `SKILL.md`. Agent Skills cover Claude Code / Codex / Cursor (discovery via
`.claude/skills` + `.agents/skills`); OpenAI / LangGraph / most others consume
**tools** via function-calling / MCP. This adds an MCP (Model Context Protocol)
stdio server that exposes each installed skill as a callable tool — so the same
skill runs everywhere. (Do BOTH Skills + MCP; validated by the landscape research.)

**Method:** test-first, phase-gated. Dependency-light — a minimal JSON-RPC 2.0
stdio server, no SDK, so the core is pure and unit-testable.

**Status:** P0 ✅ (skill→tool mapping) · P1 ✅ (JSON-RPC dispatch: initialize/tools.list/tools.call,
destructive gated as MCP error) · P2 ✅ (NDJSON stdio server + `skillwright mcp`) **— GATE MET.**
Verified end-to-end: the real `skillwright mcp` responds to `initialize` and lists a distilled skill
as an MCP tool. 238 tests green. Note: runtime input→placeholder substitution in the run path is a
known follow-up (tools accept typed inputs today; the run path doesn't yet substitute them).

---

## Design decisions

1. **One skill → one MCP tool.** Tool `name` = skill slug; `description` = the
   skill's frontmatter description; `inputSchema` = JSON Schema derived from the
   skill's `metadata.skillwright-inputs`. An agent lists tools and calls them.
2. **`tools/call` dispatches the real replay.** Calling a tool runs the skill via
   the existing run path (relay/cdp) with the given inputs, honoring the safety
   gate. The runner is dependency-injected so the protocol layer is testable
   without a browser.
3. **Destructive stays gated.** A tool call for a destructive skill surfaces the
   confirmation requirement as an MCP error, not a silent execution — the safety
   gate is not bypassable through the MCP surface.
4. **Minimal protocol, no SDK.** Implement `initialize`, `tools/list`,
   `tools/call` over newline-delimited JSON-RPC on stdio. Keeps the dependency
   footprint zero and the logic pure.

---

## Phase 0 — skill → tool mapping (pure)

- `parseSkillMeta(skillMd)` → `{ name, description, inputs }` (reads frontmatter +
  `skillwright-inputs` JSON).
- `skillToInputSchema(inputs)` → JSON Schema object.
- `listSkillTools(libraryDir)` → `McpTool[]` from the installed library.

**Gate:** unit tests — frontmatter/inputs parsing (incl. missing/empty inputs),
input-schema shape (required vs optional), a malformed SKILL.md degrades gracefully.

## Phase 1 — JSON-RPC dispatch (pure over injected runner)

- `handleMcpRequest(request, { libraryDir, runSkill })` handling `initialize`,
  `tools/list`, `tools/call`; unknown method → JSON-RPC error `-32601`.
- `tools/call` invokes the injected `runSkill(slug, inputs)` and maps the
  ReplayResult to MCP `content` (or an `isError` result for
  needs-confirmation/failed).

**Gate:** unit tests — initialize handshake; tools/list returns the library tools;
tools/call routes to the runner with parsed inputs and maps ok/needs-confirmation/
failed; unknown method errors correctly.

## Phase 2 — stdio server + CLI

- `startMcpServer({ input, output, libraryDir, runSkill })` — read NDJSON
  JSON-RPC from stdin, write responses to stdout.
- CLI `skillwright mcp` wiring the real runner (relay/cdp) + default library.
- README: "Use from any MCP client (Claude, OpenAI, Cursor…)" snippet.

**Gate:** an end-to-end test drives the server over in-memory streams (initialize
→ tools/list → tools/call with a fake runner) and asserts the JSON-RPC frames.

## Sequencing
```
P0 skill→tool ──▶ P1 JSON-RPC dispatch ──▶ P2 stdio server + `skillwright mcp` (GATE)
```
