# Capture v2 — DOM semantics + network truth (design proposal)

Status: **proposal / roadmap** (not built). Distilled from a verified deep-research
pass (`/deep-research`, 2026-07-07; 15 sources, 24 confirmed claims, 1 refuted).

## The idea (validated)

Today skillwright captures DOM gestures (click/type). A gesture is a *proxy* for
what actually happened — the truth is the HTTP call it fired
(`POST /invoices/INV-1042/approve` with the session cookie). Capturing the
**network layer via CDP** on the authenticated session gives ground truth the DOM
alone can't: exact endpoints, payloads, responses, and auth.

**Key framing (a claim was explicitly refuted):** network capture does **not**
replace DOM capture — they're *complementary*. DOM events carry semantic intent
("the user meant to approve invoice X"); the network trace carries deterministic
truth ("that meant `POST …/approve`"). Capture v2 fuses both.

## What CDP gives us (verified against the CDP spec)

- **Full request lifecycle** on the Network domain: `requestWillBeSent` →
  `responseReceived` → `loadingFinished`/`loadingFailed`.
- **Bodies**: `Network.getResponseBody` and `Network.getRequestPostData`.
- **Auth**: `Network.getCookies` reads **HttpOnly** cookies (which `document.cookie`
  cannot); `setCookies` can reinstate them.
- **Initiator**: `requestWillBeSent` carries an `initiator` (script stack / type) —
  the hook for attributing a request to the action that caused it.

**Operational caveats to engineer around (verified):**
- Response bodies are **not** inline with `responseReceived`; a separate
  `getResponseBody` can fail (`No resource with given identifier`) if the buffer
  was evicted (large responses, GC, called too late) → **buffer bodies eagerly on
  `responseReceived`, never lazily.**
- `getRequestPostData` **omits files** from multipart uploads → detect + flag.
- Extension `chrome.devtools.network.getHAR()` misses requests made **before**
  DevTools opened → use raw CDP `Network.enable` from session start, not DevTools.
- QUIC/HTTP3/WebSocket capture is limited → fall back to UI replay for those.

## Proposed architecture

### 1. Passive network observer (second, read-only CDP client)
Proven by Browserbase's `browser-trace`: every CDP target accepts multiple
concurrent clients. Attach a **second** CDP client alongside skillwright's existing
action path, enable **only** Network (observe, never drive), and record a parallel
`network[]` stream into the recording. This keeps the capture path clean and
composes with the current extension relay.

### 2. Correlation layer — skillwright's novel contribution
The deep-research pass found **no existing tool** attributes captured HTTP calls to
the user action that caused them, or chooses UI-replay vs request-replay per step.
That's our opening. For each DOM action at time *T*, bind the requests fired in
`[T, T+Δ]` (refined by CDP `initiator`) → per-step `{ domAction, requests[] }`.

### 3. Effect from HTTP method — a non-LLM "Tier 0" safety signal
Derive the effect tag from the correlated method: `GET` → readonly;
`POST/PUT/PATCH/DELETE` → mutating/destructive. Fuse into the existing rule:
`roundUpEffect([networkEffect, llmTag, heuristicTag])`. This is **ground-truth
evidence**, and it directly retires the one accepted residual risk (LLM-inferred
effect tags being the safety control — flagged by both prior reviewers).

### 4. Corroborated parameterization
The distiller now sees the actual request body/query/path. When the demo value
appears in *both* the DOM input and the request (`INV-1042` in the field **and**
`POST /invoices/INV-1042/approve`), parameterization is corroborated, not guessed.
Auto-template path segments (the mitmproxy2swagger pattern:
`/invoices/INV-1042/approve` → `/invoices/{invoice_number}/approve`).

### 5. Two replay modes per step (the ladder extends)
- **UI replay** (today) — drive the DOM. Needed for UI-only effects / complex
  client state; robust to backend refactors.
- **API replay** (new) — re-execute the captured request directly with the
  session's **live** auth. Faster, deterministic, immune to UI churn; ideal for
  pure data operations. Still passes the safety gate for destructive methods.

The distiller picks per step; the ladder becomes: API-replay → UI-replay → heal.

### 6. Auth: store the *shape*, never the credential
Do **not** bake captured cookies/tokens into the skill (they expire, and they're
secrets). Store the request *shape*; at replay time pull **live** auth from the
current authenticated session (`Network.getCookies` / the browser profile). One
move solves both the token-rotation problem *and* the secret-at-rest risk.

### 7. Redaction owns the network layer
Chrome DevTools HAR export sanitizes `Cookie`/`Set-Cookie`/`Authorization` by
default (v130+) — but our raw-CDP path does **not**, so we must. Extend the secret
net to request/response bodies + headers: `Authorization`/`Cookie`/`Set-Cookie`,
`Basic base64(user:pass)`, connection strings, JWTs, POST-body secrets (matches the
redaction gaps the earlier landscape research flagged).

### 8. Curation (two-pass, human-in-the-loop)
A capture is noisy (analytics, telemetry, asset loads). Follow mitmproxy2swagger:
the distiller keeps action-correlated requests and ignores the rest; optionally
surface a curation step.

## Prior art (each pipeline stage is already proven)

| Stage | Proven by |
|---|---|
| Passive 2nd-CDP-client firehose → NDJSON | Browserbase `browser-trace` |
| Traffic → parameterized OpenAPI, 2-pass curation, `{id}` templating | mitmproxy2swagger |
| Capture + client-side (re-execute) & server-side (serve) replay + scripting | mitmproxy |
| `page.on(request/response)`, `route()` abort/fulfill/continue, `routeFromHAR(update:true)` | Playwright |
| Extension HAR: `getHAR()`, `onRequestFinished`, `getContent()` | `chrome.devtools.network` |
| Default secret-sanitized HAR export (v130+) | Chrome DevTools |

## Open problems (skillwright can lead here)

1. **Cross-request dataflow** — one response's value feeds a later request (session
   chaining). No verified tool extracts this automatically.
2. **Token/auth rotation** — §6 (pull live auth at replay) is our answer; validate it.
3. **GraphQL / single-endpoint APIs** — URL-path templating collapses to one path;
   need operation-name/body-level diffing instead.
4. **The correlation/alignment layer** (§2) — attributing HTTP calls to actions and
   choosing replay mode per step. Unsolved by prior art; our differentiator.

## Recommendation

Sequence this as **Capture v2**, smallest-valuable-slice first:
1. **Passive network observer + effect-from-method (Tier 0).** Highest safety ROI,
   no replay changes, retires the residual risk. Ship first.
2. **Corroborated parameterization** from request payloads.
3. **API-replay mode** + live-auth-at-replay behind the safety gate.
4. **Correlation layer + curation** as the capture matures.
