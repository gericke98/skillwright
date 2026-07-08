# Security Policy

skillwright drives a real, authenticated browser and handles pages that may
contain credentials. Security is a first-class design constraint, not an
afterthought. This document explains the trust model and how to report issues.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via [GitHub Security Advisories](../../security/advisories/new)
(preferred), or by email to **santiago.gericke@techtorch.io** with the subject
`skillwright security`. Include a description, reproduction steps, and impact.

You'll get an acknowledgement within 72 hours and a remediation timeline after
triage. Coordinated disclosure is appreciated; credit is given unless you prefer
otherwise.

## Supported versions

skillwright is pre-1.0. Security fixes land on the latest release only until 1.0.

## Trust model

**Recordings stay local.** Capture writes `recording.json` and screenshots to
your machine. The only data that leaves is what your chosen LLM backend sends
during `distill` — and the default `agent-cli` backend inherits the trust
decisions you already made for that agent CLI. The direct `api` backend is
opt-in via `SKILLWRIGHT_API_KEY`.

**Secrets are redacted before they touch disk.** Redaction runs at capture time
in the extension (D17): password fields, URL tokens (query/path/fragment,
including OAuth implicit-flow fragments), API-key-shaped strings, and
Luhn-valid card numbers are replaced with `{secret}` *before* anything is
written. `distill` runs a second-pass net over every output file. The bias is
deliberately toward over-redaction. This is enforced by adversarial eval
fixtures (tokens-in-URLs, key-shaped fields, card numbers) that assert **no
secret survives in any generated file** — not merely asserted in prose.

**The `debugger` permission is user-initiated and scoped.** The extension uses
`chrome.debugger` only while you are actively recording or replaying, to
dispatch trusted input and read page structure. There is no background capture;
recording is explicit and visibly indicated.

**The relay is localhost-only with two-party auth.** `skillwright relay` binds
locally and pairs with the extension via a freshly minted token; the token is
compared in constant time, and the extension pins it and rejects unknown
endpoints. Skills inherit auth from your browser profile — no credentials are
stored in any artifact.

**Replay has a load-bearing safety gate.** Every step is effect-tagged
(`readonly` / `mutating` / `destructive`) by the distiller fused with a
non-LLM heuristic floor that can only *raise* severity. A `destructive` step
requires explicit confirmation; a step that may have partially executed is
never re-run (the double-send guard); a self-healed selector is quarantined and
promoted to canonical only after repeated clean confirmations, so a wrong-but-
passing one-off heal can't silently poison a shared skill.

## Known limitations (v1)

- The extension ships unpacked (developer mode); managed/enterprise Chrome
  profiles can disable it. A Chrome Web Store submission is a planned fast-follow.
- Effect tags rely partly on LLM inference; the heuristic floor and the
  round-up-on-uncertainty rule mitigate under-tagging, and the eval suite gates
  on destructive-tag recall, but static guarantees are not possible without
  analyzing the target app.
