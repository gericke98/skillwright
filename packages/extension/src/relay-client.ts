/**
 * Extension-side relay client (design B) — the ONE piece that must be verified
 * live (it drives chrome.debugger). It connects OUT to the CLI-hosted relay,
 * pairs with the token, and performs each replay step as a TRUSTED action:
 * clicks go through the Input domain (real mouse events), so pages that reject
 * synthetic events still work. Element resolution reuses the unit-tested
 * `resolveElement`, injected into the page via Runtime.evaluate.
 */
import { resolveElement } from "./dom-resolve";

export type RelayStatus = "connecting" | "paired" | "rejected" | "closed" | "error";

/** Expression returning click point + diagnostics for `selector`, or {found:false}. */
function coordsExpression(selector: string): string {
  return `(() => {
    const resolveElement = ${resolveElement.toString()};
    const el = resolveElement(${JSON.stringify(selector)}, document);
    if (!el) return { found: false };
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const at = document.elementFromPoint(x, y);
    return {
      found: true, x, y,
      dpr: window.devicePixelRatio,
      hit: at === el || el.contains(at) || (at && at.contains(el)),
      atPoint: at ? (at.tagName + "/" + (at.getAttribute("aria-label") || at.className || "")) : null,
    };
  })()`;
}

/** Expression: does `selector` still resolve to an element? (post-click check) */
function existsExpression(selector: string): string {
  return `(() => {
    const resolveElement = ${resolveElement.toString()};
    return !!resolveElement(${JSON.stringify(selector)}, document);
  })()`;
}

/** Expression returning the element ITSELF (for `returnByValue: false` → objectId). */
export function elementRefExpression(selector: string): string {
  return `(() => {
    const resolveElement = ${resolveElement.toString()};
    return resolveElement(${JSON.stringify(selector)}, document);
  })()`;
}

/** Expression that focuses `selector`; returns true on success. */
function focusExpression(selector: string): string {
  return `(() => {
    const resolveElement = ${resolveElement.toString()};
    const el = resolveElement(${JSON.stringify(selector)}, document);
    if (!el) return false;
    el.focus();
    return true;
  })()`;
}

/** Expression that fills `selector` with `value`; returns true on success. */
export function fillExpression(selector: string, value: string): string {
  return `(() => {
    const resolveElement = ${resolveElement.toString()};
    const el = resolveElement(${JSON.stringify(selector)}, document);
    if (!el) return false;
    el.focus();
    // A file input can't be set from page JS (assigning .value throws a
    // SecurityError). performStep routes files to DOM.setFileInputFiles before
    // reaching here, so this is only a defensive floor: fail, never throw.
    if (el.type === "file") return false;
    // A checkbox/radio carries its meaning in .checked, not .value — capture
    // records the boolean state ("true"/"false"), so drive .checked here.
    if (el.type === "checkbox" || el.type === "radio") {
      el.checked = ${JSON.stringify(value)} === "true";
    } else if ("value" in el) {
      el.value = ${JSON.stringify(value)};
    } else if (el.isContentEditable) {
      // Rich-text editor (contenteditable div): no .value — set its text.
      el.textContent = ${JSON.stringify(value)};
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`;
}

/**
 * Expression: which replay strategy `selector` needs.
 *
 *  - "file"   → only CDP can set it (page JS assigning .value throws SecurityError)
 *  - "toggle" → checkbox/radio: meaning lives in .checked, not text
 *  - "select" → <select>: an option must be chosen, not typed
 *  - "text"   → a real text field / contenteditable: TYPE it via Input.insertText
 *               so the page sees genuine input events (React's value tracker
 *               ignores a raw .value assignment, so JS-filled forms submit empty)
 *  - null     → not found
 */
export function elementKindExpression(selector: string): string {
  return `(() => {
    const resolveElement = ${resolveElement.toString()};
    const el = resolveElement(${JSON.stringify(selector)}, document);
    if (!el) return null;
    if (el.type === "file") return "file";
    if (el.type === "checkbox" || el.type === "radio") return "toggle";
    if (el.tagName === "SELECT") return "select";
    return "text";
  })()`;
}

/**
 * Expression that focuses `selector` and SELECTS its existing content, so a
 * following `Input.insertText` replaces the old value instead of appending to
 * it. Returns true on success.
 */
export function focusAndSelectAllExpression(selector: string): string {
  return `(() => {
    const resolveElement = ${resolveElement.toString()};
    const el = resolveElement(${JSON.stringify(selector)}, document);
    if (!el) return false;
    el.focus();
    if (typeof el.select === "function") {
      el.select();
    } else if (el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return true;
  })()`;
}

/** Expression: a compact ARIA-ish snapshot of interactive elements + the URL,
 * for the tier-3 healer to find a fresh selector (heal over the relay). */
function snapshotExpression(): string {
  return `(() => {
    const els = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role], [aria-label]'));
    const lines = [];
    for (const el of els.slice(0, 300)) {
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 80);
      if (name) lines.push(role + ' "' + name + '"');
    }
    return JSON.stringify({ url: location.href, aria: lines.join('\\n') });
  })()`;
}

async function evaluate(tabId: number, expression: string): Promise<unknown> {
  const res = (await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  })) as { result?: { value?: unknown } };
  return res?.result?.value;
}

interface PerformInput {
  action: string;
  selector: string;
  value?: string;
  key?: string;
  modifiers?: string[];
}

/** Named keys: physical `code` + Windows virtual key code. */
const NAMED_KEYS: Record<string, { code: string; vk: number }> = {
  Enter: { code: "Enter", vk: 13 },
  Escape: { code: "Escape", vk: 27 },
  Tab: { code: "Tab", vk: 9 },
  Backspace: { code: "Backspace", vk: 8 },
  Delete: { code: "Delete", vk: 46 },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  ArrowDown: { code: "ArrowDown", vk: 40 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
};

export interface KeyEventFields {
  key: string;
  code: string;
  windowsVirtualKeyCode: number;
  /** Only for keys that produce input. Enter needs "\r" or forms don't submit. */
  text?: string;
}

/**
 * CDP key-event fields for a captured key.
 *
 * `code` is the PHYSICAL key ("KeyS"), distinct from the logical `key` ("s") —
 * dispatching a shortcut with `code: "s"` (as the old table did) produces an
 * event real apps ignore, because no such physical code exists.
 *
 * Total: an unrecognized key degrades to vk 0 rather than throwing.
 */
export function keyEventFields(key: string): KeyEventFields {
  const named = NAMED_KEYS[key];
  if (named) {
    const fields: KeyEventFields = { key, code: named.code, windowsVirtualKeyCode: named.vk };
    // Enter's text is what actually triggers form submission / newline insert.
    if (key === "Enter") fields.text = "\r";
    return fields;
  }
  if (/^[a-zA-Z]$/.test(key)) {
    const upper = key.toUpperCase();
    return { key, code: `Key${upper}`, windowsVirtualKeyCode: upper.charCodeAt(0) };
  }
  if (/^[0-9]$/.test(key)) {
    return { key, code: `Digit${key}`, windowsVirtualKeyCode: key.charCodeAt(0) };
  }
  return { key, code: "", windowsVirtualKeyCode: 0 };
}

/** CDP modifier bitmask. */
const MODIFIER_BITS: Record<string, number> = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

/** OR the CDP modifier bits. Unknown names contribute nothing (never NaN). */
export function modifierMask(modifiers: string[] = []): number {
  return modifiers.reduce((mask, m) => mask | (MODIFIER_BITS[m] ?? 0), 0);
}

export interface KeyDispatchEvent extends KeyEventFields {
  type: "keyDown" | "rawKeyDown" | "keyUp";
  nativeVirtualKeyCode: number;
  modifiers: number;
  /** Passed straight to `chrome.debugger.sendCommand`, which takes a bag. */
  [key: string]: unknown;
}

/**
 * The exact `Input.dispatchKeyEvent` sequence for one captured keypress.
 *
 * Two rules, both load-bearing (and both what Chrome's own tooling does):
 *  - `text` is what makes a key INSERT something. Enter without `text: "\r"`
 *    doesn't submit a form.
 *  - A key held with any non-Shift modifier is a SHORTCUT, not text: its
 *    `text` must be dropped, or Ctrl+S both fires the shortcut AND types an
 *    "s" into the page. (Shift is exempt — Shift+A is genuinely "A".)
 *
 * The event type follows from that: `keyDown` when the press produces text,
 * `rawKeyDown` when it doesn't.
 */
export function keyDispatchEvents(key: string, modifiers: string[] = []): KeyDispatchEvent[] {
  const fields = keyEventFields(key);
  const mask = modifierMask(modifiers);
  const SHIFT = 8;
  const text = mask & ~SHIFT ? undefined : fields.text;
  const base = {
    ...fields,
    text,
    nativeVirtualKeyCode: fields.windowsVirtualKeyCode,
    modifiers: mask,
  };
  return [
    { ...base, type: text ? "keyDown" : "rawKeyDown" },
    { ...base, type: "keyUp" },
  ];
}

export async function performStep(
  tabId: number,
  cmd: PerformInput,
): Promise<{ ok: boolean; error?: string; url?: string; aria?: string }> {
  try {
    if (cmd.action === "snapshot") {
      const raw = await evaluate(tabId, snapshotExpression());
      try {
        const s = JSON.parse(String(raw)) as { url?: string; aria?: string };
        return { ok: true, url: s.url ?? "", aria: s.aria ?? "" };
      } catch {
        return { ok: true, url: "", aria: "" };
      }
    }
    if (cmd.action === "click") {
      const info = (await evaluate(tabId, coordsExpression(cmd.selector))) as {
        found: boolean;
        x?: number;
        y?: number;
        dpr?: number;
        hit?: boolean;
        atPoint?: string | null;
      };
      if (!info.found) return { ok: false, error: "element not found" };
      const { x, y } = info as { x: number; y: number };
      // Proper trusted-click sequence: move, press (button held), release (none held).
      const send = (type: string, buttons: number) =>
        chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
          type,
          x,
          y,
          button: "left",
          buttons,
          clickCount: 1,
        });
      await send("mouseMoved", 0);
      await send("mousePressed", 1);
      await send("mouseReleased", 0);
      // Self-verify: for the delete flow, a working click removes the element.
      const stillThere = (await evaluate(tabId, existsExpression(cmd.selector))) === true;
      if (stillThere) {
        return { ok: false, error: `clicked but element persists — diag ${JSON.stringify(info)}` };
      }
      return { ok: true };
    }
    if (cmd.action === "change" || cmd.action === "input" || cmd.action === "select") {
      const value = cmd.value ?? "";
      const kind = (await evaluate(tabId, elementKindExpression(cmd.selector))) as string | null;
      if (kind === null) return { ok: false, error: "element not found" };

      if (kind === "file") {
        // A file input can only be set through CDP: page JS assigning .value
        // throws SecurityError. Resolve the element BY REFERENCE (objectId,
        // not by value) and hand that to DOM.setFileInputFiles.
        const res = (await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
          expression: elementRefExpression(cmd.selector),
          returnByValue: false,
        })) as { result?: { objectId?: string } };
        const objectId = res?.result?.objectId;
        if (!objectId) return { ok: false, error: "element not found" };
        await chrome.debugger.sendCommand({ tabId }, "DOM.setFileInputFiles", {
          objectId,
          files: [value],
        });
        return { ok: true };
      }

      if (kind === "text") {
        // TYPE it: Input.insertText produces real input events. A raw .value
        // assignment is invisible to React's value tracker, so a JS-filled
        // form submits empty — the exact failure the relay used to have.
        const focused = (await evaluate(tabId, focusAndSelectAllExpression(cmd.selector))) === true;
        if (!focused) return { ok: false, error: "element not found" };
        await chrome.debugger.sendCommand({ tabId }, "Input.insertText", { text: value });
        return { ok: true };
      }

      // toggle / select: state, not text — the JS path is correct for these.
      const ok = (await evaluate(tabId, fillExpression(cmd.selector, value))) === true;
      return { ok, error: ok ? undefined : "element not found" };
    }
    if (cmd.action === "keydown") {
      const focused = (await evaluate(tabId, focusExpression(cmd.selector))) === true;
      if (!focused) return { ok: false, error: "element not found" };
      for (const event of keyDispatchEvents(cmd.key || "Enter", cmd.modifiers)) {
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", event);
      }
      return { ok: true };
    }
    if (cmd.action === "navigate") return { ok: true };
    return { ok: false, error: `unsupported action ${cmd.action}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Connect to the relay and serve perform commands against `tabId` until the
 * socket closes. Returns the live WebSocket so the caller can close it.
 */
export async function connectRelay(
  port: number,
  token: string,
  tabId: number,
  onStatus: (s: RelayStatus) => void,
): Promise<WebSocket> {
  onStatus("connecting");
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("relay connection failed")), { once: true });
  });

  await chrome.debugger.attach({ tabId }, "1.3").catch(() => {
    /* already attached — fine */
  });
  ws.send(JSON.stringify({ kind: "pair", token }));

  ws.addEventListener("message", async (ev) => {
    const msg = JSON.parse(String((ev as MessageEvent).data));
    if (msg.kind === "paired") {
      onStatus(msg.ok ? "paired" : "rejected");
      if (!msg.ok) ws.close();
    } else if (msg.kind === "perform") {
      const res = await performStep(tabId, msg as PerformInput);
      ws.send(
        JSON.stringify({
          kind: "result",
          id: msg.id,
          ok: res.ok,
          error: res.error,
          url: res.url,
          aria: res.aria,
        }),
      );
    }
  });

  ws.addEventListener("close", () => {
    chrome.debugger.detach({ tabId }).catch(() => {});
    onStatus("closed");
  });

  return ws;
}
