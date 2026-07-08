# Hero demo — storyboard & shot script

The README hero should show the whole pitch: **demonstrate a task once → get a
skill → an agent runs it forever (and self-heals).** The *run + heal* segment is
already reproducible headlessly (`pnpm demo` → `docs/assets/replay-heal.gif`).
The *record + distill* segment needs a real screen capture on your machine —
this is the shot script for it.

Target: **20–40s**, muxed or stitched, exported as a GIF (autoplays inline on
GitHub) plus a higher-fidelity MP4 for the docs site / X.

## Setup (before recording)

- Clean Chrome window, skillwright extension loaded, side panel open.
- A real, authenticated site you can demo safely (or the fixture: `pnpm --filter
  @skillwright/fixture-app serve`). Pick a task with a clear payoff (approve /
  send / delete something).
- Terminal beside the browser, big font, minimal prompt.
- Screen recorder at 30fps; crop to a tight 16:10 region.

## Shot list

| # | ~sec | Screen | What happens | On-screen caption |
|---|------|--------|--------------|-------------------|
| 1 | 0–6  | Browser | You do the task once (click through it naturally) with the extension recording indicator visible | "Do the task once, in your real browser" |
| 2 | 6–9  | Side panel | Click Stop → it saves `recording.json` | "skillwright was watching" |
| 3 | 9–16 | Terminal | `skillwright distill recording.json --semantic` → prints the new skill path; quick `cat SKILL.md` reveal (typed inputs + effect tags) | "…and compiled it into a portable skill" |
| 4 | 16–30| Browser + terminal | `skillwright run <skill>` replays it; when a selector is stale, the heal kicks in and it completes | "Any agent runs it — and heals when the site changes" |
| 5 | 30–34| End card | Logo + one line + `npm i -g skillwright` | — |

Segment 4 can be the existing `pnpm demo` GIF if you don't want to re-record the
replay live.

## Production notes

- Lead with the browser action — never a static screenshot (the launch research
  is emphatic about this).
- Keep captions short, high-contrast, bottom-third (matches the `pnpm demo`
  caption style so segments stitch cleanly).
- Show the **generated `SKILL.md`** on screen for a beat — the portable artifact
  is the moat; make it tangible.
- Export: record MP4 → `ffmpeg -i hero.mp4 -vf "fps=15,scale=1000:-1:flags=lanczos,palettegen" p.png`
  then `ffmpeg -i hero.mp4 -i p.png -lavfi "fps=15,scale=1000:-1[x];[x][1:v]paletteuse" docs/assets/hero.gif`.
- Swap `docs/assets/replay-heal.gif` for `docs/assets/hero.gif` in the README
  once the full hero exists; keep `replay-heal.gif` as the secondary "self-heal"
  clip.

## One benchmarkable claim (put it above the fold, uv-style)

Pick and verify one before launch, e.g.:
- "Self-heals broken selectors without re-recording."
- "First skill in under 60 seconds."
- Distiller eval pass rate from `packages/evals/BASELINE.md` (secrets 0-leak,
  destructive-recall 100%).
