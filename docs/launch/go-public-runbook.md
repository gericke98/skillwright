# Go-public runbook

Everything to take skillwright from local-only to a published OSS project.
Steps marked **[you]** are yours (account actions); **[me]** are ones I run for
you once you give the go + your GitHub handle.

## 0. Prereqs

- **[you]** A GitHub account/org handle → tell me the handle so I can fix repo
  URLs (CHANGELOG compare link, package `repository` field, security link) and
  set the remote.
- **[you]** Decide the repo name (default: `skillwright`) and visibility (public).

## 1. Create the repo — **[you]**

```bash
# On github.com: create an empty public repo named "skillwright" (no README/license,
# we already have them). Then tell me the handle; I'll wire the remote and push.
```

## 2. Finalize URLs + push — **[me]** (after handle + go)

- Set `repository`, `homepage`, `bugs` in `packages/cli/package.json`.
- Fix the `[Unreleased]` compare link in `CHANGELOG.md`.
- `git remote add origin git@github.com:<handle>/skillwright.git`
- `git push -u origin master` (or rename default branch to `main` first if you prefer).

## 3. First release — **[me]** once you confirm the version

- Tag `v0.1.0` → the release workflow builds, `npm publish --provenance`, and
  attaches the extension zip to the GitHub Release.
- **[you]** Two secrets for the release workflow: `NPM_TOKEN` (an npm automation
  token — create at npmjs.com → Access Tokens) in the repo's Actions secrets.
  npm provenance also needs the repo public (it is) + the workflow's `id-token`
  permission (already set).
- **[you]** Verify `npm view skillwright` resolves after publish.

## 4. Chrome extension — **[you]**, with my prep

- v1 ships unpacked from the GitHub Release zip (already automated). No store
  review needed for launch.
- Chrome Web Store submission is a deliberate fast-follow (the `debugger`
  permission invites review). Not a launch blocker.

## 5. Launch day — **[you]**, prepped by me

- Record the hero GIF per `docs/demo/hero-storyboard.md` (the record→distill half
  needs your real browser).
- Show HN, Tue–Thu ~8am ET: *"Show HN: skillwright – turn a browser task you demo
  once into a portable agent skill."* Cross-post r/LocalLLaMA + an X thread with
  the GIF. Stage `good-first-issue`s + a Discord. Be present all day.

## Rollback / safety

- Nothing here is irreversible except **npm publish** (a version can't be
  re-published) and **Show HN** (one shot — don't launch before the README + GIF
  are ready). Pushing to GitHub is reversible (force-push / delete repo).
- The repo has no secrets committed (verified): recordings stay local, redaction
  runs before disk, `.gitignore` covers build output. Safe to make public.
