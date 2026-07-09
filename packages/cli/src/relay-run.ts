import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Recording, toReplaySteps, applyInputs } from "@skillwright/shared";
import { defaultLibraryDir } from "./paths";
import { runSkill, RelayStepDriver, type ReplayResult } from "./index";
import { mintToken } from "./token";
import { WsRelayServer } from "./relay-server";
import { applyPromotedOverlay, buildHealer, confirmCleanRun, makeOnHeal } from "./heal-wiring";

export interface RelayRunOptions {
  confirmDestructive: boolean;
  port?: number;
  libraryDir?: string;
  /** Runtime inputs substituted into `{placeholder}` step values/selectors. */
  inputs?: Record<string, string>;
  /** Called once the relay is listening, with the pairing details to show. */
  onReady?: (info: { url: string; token: string; port: number }) => void;
  /** How long to wait for the extension to pair before giving up. */
  extensionTimeoutMs?: number;
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/**
 * Replay a skill against the user's real profile via the relay: host the WS
 * endpoint, wait for the extension to pair, then drive runSkill with the
 * RelayStepDriver. The extension performs each step as a trusted chrome.debugger
 * action.
 */
export async function runSkillViaRelay(slug: string, opts: RelayRunOptions): Promise<ReplayResult> {
  const dir = join(opts.libraryDir ?? defaultLibraryDir(), slug);
  const recording = JSON.parse(
    readFileSync(join(dir, "assets", "recording.json"), "utf8"),
  ) as Recording;
  const overlaid = toReplaySteps(recording);
  applyPromotedOverlay(overlaid, dir);
  const steps = applyInputs(overlaid, opts.inputs ?? {});

  const token = mintToken();
  const relay = new WsRelayServer({ token, port: opts.port ?? 9333 });
  const { url, port } = await relay.start();
  opts.onReady?.({ url, token, port });

  try {
    const timeoutMs =
      opts.extensionTimeoutMs ?? (Number(process.env.SKILLWRIGHT_RELAY_TIMEOUT_MS) || 120_000);
    await withTimeout(
      relay.waitForExtension(),
      timeoutMs,
      "the skillwright extension did not connect — open the side panel and click Connect",
    );
    const result = await runSkill(steps, new RelayStepDriver(relay.transport), {
      confirmDestructive: opts.confirmDestructive,
      heal: buildHealer(),
      onHeal: makeOnHeal(dir),
    });
    if (result.status === "ok") confirmCleanRun(dir);
    return result;
  } finally {
    await relay.close();
  }
}
