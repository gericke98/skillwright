# M4 — Install + Distribution (Build Plan)

**Milestone (spec §14.4):** `bskill install`, npm publish, extension delivery, release CI, hardened
two-party auth.
**Gate:** fresh machine → working install from public artifacts, AND the installed skill executes in
script mode from a non-Anthropic agent (Codex CLI or equivalent) — closing success criterion 4.

**Builds on:** `writeSkillDirectory`/`defaultLibraryDir` (paths), the promoted-selector overlay (M3),
the whole distill+run pipeline (M1–M3).

**Method:** test-first (TDD), phase-gated.

**Status:** P0 ✅ · P1 ✅ · P2 ✅ (CI + tag-driven release workflows authored & YAML-valid; extension
builds + zips locally; root README documents install + the unpacked-extension limitation; two-party
relay token auth already timing-safe from M1) — **actual npm publish + Release creation await a remote**
· P3 ⏳ next.

---

## The remote decision (read first)

M4 is the first milestone whose *full* gate needs a GitHub remote: npm publish, GitHub Release
artifacts, and CI all require publishing externally. This plan is structured so **everything of
substance is built and verified locally** — install/list/sync, npm packaging (via a packed tarball),
and cross-agent script-mode execution — and the **irreversible public steps (npm publish, Release
creation) are isolated in P2 and gated on an explicit remote decision**. The "fresh machine from
public artifacts" clause is verified against a **local packed tarball** as the stand-in artifact until
a remote exists (documented deviation).

---

## Design decisions locked before coding

1. **Symlink-preferred, copy-fallback, and the copy is tracked as stale-able.** `install` symlinks the
   library skill into `.claude/skills/` and `.agents/skills/`; where symlinks fail (Windows, restricted
   FS) it copies. A copy silently diverges from the library after a heal promotion (TODOS finding), so
   every install is recorded in an install manifest with its `mode` (`link`|`copy`); `list` flags
   copy-mode installs as stale-able and `bskill sync` refreshes them. Copy is NOT treated as equivalent
   to symlink.
2. **Install targets both agent ecosystems.** `.claude/skills/` (Claude Code) and `.agents/skills/`
   (the cross-agent standard Codex et al. read) — that dual write is what makes criterion 4 reachable.
3. **The published CLI runs compiled JS, not tsx.** `bin` points at `dist/bin.js` (built with a
   shebang); `files` ships `dist` only; `npx bskill` works with zero dev deps. Local dev keeps using
   the `src` entry.
4. **Publish is tag-driven and provenance-signed, but never automatic.** The release workflow runs on
   a version tag; it is not wired to run on push. No secret or publish happens without the maintainer
   cutting a tag against a real remote.

---

## Phase 0 — `bskill install` / `list` / `sync` (local, fully testable)

**Deliverables**
- `installSkill(slug, { scope: "project"|"user", projectDir?, linkMode? })` — resolves the target
  roots (`.claude/skills/`, `.agents/skills/`), symlinks the library skill in, copy-fallback on symlink
  failure; idempotent (re-install replaces cleanly). Records each install in an install manifest with
  `mode`.
- `listSkills()` — library contents + per-skill install locations and mode; copy-mode installs flagged
  stale-able.
- `syncInstalls()` — refresh copy-mode installs from the library.
- CLI: `bskill install [<slug>|--all] [--project <dir>|--user]`, `bskill list`, `bskill sync`.

**Gate:** install a distilled skill into a temp project → both target dirs resolve to the library
skill; symlink preferred, copy-fallback exercised; re-install idempotent; `list` shows library +
locations + mode; `sync` refreshes a copied install after a library change.

---

## Phase 1 — npm packaging (publishable CLI, verified via tarball)

**Deliverables**
- CLI `package.json`: `bin: { bskill: "./dist/bin.js" }`, `files: ["dist"]`, `exports`, a build that
  emits `dist/bin.js` with a `#!/usr/bin/env node` shebang, `prepublishOnly` build hook, correct
  workspace-dep handling for publish (shared bundled or published).
- Ensure the built CLI runs standalone (no tsx, no workspace symlinks) from an installed tarball.

**Gate:** `pnpm pack` (or `npm pack`) produces a tarball; installing it into a temp dir exposes a
working `bskill` — `bskill --help`, `bskill distill <fixture>`, `bskill list` all run on compiled JS
with no dev dependencies present.

---

## Phase 2 — Release CI + extension delivery (config local; publish gated on remote)

**Deliverables**
- GitHub Actions **CI** workflow: typecheck, unit + integration (headless Chromium), conformance.
- **Release** workflow: on a version tag → build → `npm publish --provenance` → attach the extension
  zip to the GitHub Release. LLM evals stay on-demand (token cost), not per-push.
- Extension build → distributable zip.

**Gate (local-verifiable):** the workflow YAML is valid and every non-publish step (build, test, zip)
runs green locally via the same commands; the extension zip is produced. **`npm publish` and Release
creation are NOT run** until the remote decision is made — that's the one irreversible, outward-facing
step and it waits for explicit go.

---

## Phase 3 — Cross-agent script-mode acceptance (closes criterion 4)

**Deliverables**
- Install a distilled skill into a temp project's `.agents/skills/`; drive **Codex CLI** to discover
  it and execute it in script mode (`bskill run <skill>` / the `scripts/replay.ts` entrypoint resolves
  and dispatches).
- Document the fresh-machine install path (from the P1 tarball as the artifact; from the npm package
  once published).

**Gate (= M4 milestone gate):** a non-Anthropic agent (Codex CLI) executes the installed skill in
script mode from a fresh install — criterion 4. The public-artifact half is verified against the local
tarball until a remote is provisioned.

---

## Sequencing
```
P0 install/list/sync ──▶ P1 npm packaging (tarball) ──▶ P2 CI/release config (publish gated) ──▶ P3 cross-agent (GATE)
                                                              │
                                                    remote decision here
```
