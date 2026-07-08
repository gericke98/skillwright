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
function fillExpression(selector: string, value: string): string {
  return `(() => {
    const resolveElement = ${resolveElement.toString()};
    const el = resolveElement(${JSON.stringify(selector)}, document);
    if (!el) return false;
    el.focus();
    if ("value" in el) el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
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
}

const VIRTUAL_KEYS: Record<string, number> = {
  Enter: 13,
  Escape: 27,
  Tab: 9,
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
};

async function performStep(
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
      const ok = (await evaluate(tabId, fillExpression(cmd.selector, cmd.value ?? ""))) === true;
      return { ok, error: ok ? undefined : "element not found" };
    }
    if (cmd.action === "keydown") {
      const focused = (await evaluate(tabId, focusExpression(cmd.selector))) === true;
      if (!focused) return { ok: false, error: "element not found" };
      const key = cmd.key || "Enter";
      const vk = VIRTUAL_KEYS[key] ?? 0;
      const base = { key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", { type: "keyDown", ...base });
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
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
