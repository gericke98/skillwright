# Dogfooding checklist — capture your real day-to-day

The path from "works on the fixture" to "perfect on real sites" is you using it.
Run skillwright on your own real tasks and log what breaks. Each failure is a
`good-first-issue` and a test fixture.

## Setup (once)

- [ ] `npm i -g skillwright` (or run from the repo)
- [ ] Load the extension unpacked (`skillwright-extension.zip` → chrome://extensions)
- [ ] `skillwright relay` and pair the side panel

## Capture a real task (repeat for ~5 varied tasks)

Pick tasks across these axes so you exercise the hard cases:

- [ ] A **read** task (search/filter/view) — should tag readonly
- [ ] A **write** task (edit/save a form) — should tag mutating
- [ ] A **destructive** task (delete/send/pay) — must require confirmation
- [ ] A task with **typed inputs** (an ID/amount you'd change) — check parameterization
- [ ] A task behind **SSO / OAuth** — the redirect + auth-cookie case
- [ ] A task inside an **iframe** or a heavy **SPA** — the selector/robustness case

For each, note:

| Task | Captured cleanly? | Distilled sensibly? | Replayed? | Healed on a break? | Effect tags right? | Secrets leaked? |
|------|------|------|------|------|------|------|

## What to watch for (the honest gaps)

- **Capture v2 (network truth) isn't live yet** — effect tags come from labels +
  heuristics until the passive CDP observer ships. Flag any mis-tagged step.
- **Relay-transport heal** is not wired — heal only fires on the cdp path today.
- **Copy-mode installs** on Windows/restricted FS diverge after a promotion —
  `skillwright list` flags them; `skillwright sync` refreshes.
- **Secrets**: confirm redaction on real forms — if ANY credential appears in a
  generated file, that's a P0 (open a SECURITY report, not a public issue).

## Turn findings into the roadmap

- [ ] File each break as an issue (use the bug template).
- [ ] Add the failing page as a fixture where you can.
- [ ] The most common break → the next milestone.
