/**
 * `skillwright doctor` — a first-run environment preflight. First-run failures
 * (no LLM backend on PATH, missing Chromium, an unwritable library) are the most
 * common reason a first real capture silently fails; this surfaces them with
 * clear remediation before the user records anything.
 *
 * The core is pure (probes injected) so it's testable without touching the real
 * filesystem, PATH, or Playwright; `bin.ts` wires the real probes.
 */
import { defaultLibraryDir } from "./paths";

/** Agent CLIs the agent-cli backend autodetects, in priority order. */
const AGENT_BINARIES = ["claude", "codex", "gemini"];
/** Minimum Node major (pnpm/node:sqlite + modern APIs). */
const MIN_NODE_MAJOR = 18;

export interface DoctorProbes {
  env: NodeJS.ProcessEnv;
  /** True if `bin` resolves to an executable on PATH. */
  which: (bin: string) => boolean;
  /** True if the given directory exists-or-can-be-created and is writable. */
  canWrite: (dir: string) => boolean;
  /** True if Playwright's Chromium is installed (for the `--cdp` replay path). */
  chromiumInstalled: () => boolean;
  /** Running Node major version. */
  nodeMajor: number;
}

export type DoctorStatus = "pass" | "warn" | "fail";
export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
}
export interface DoctorReport {
  checks: DoctorCheck[];
  /** False if any check is a hard `fail`. */
  ok: boolean;
}

export function runDoctor(probes: DoctorProbes): DoctorReport {
  const checks: DoctorCheck[] = [];

  // Node version.
  checks.push(
    probes.nodeMajor >= MIN_NODE_MAJOR
      ? { name: "Node", status: "pass", detail: `v${probes.nodeMajor}` }
      : {
          name: "Node",
          status: "fail",
          detail: `v${probes.nodeMajor} — skillwright needs Node ${MIN_NODE_MAJOR}+`,
        },
  );

  // LLM backend for distillation.
  if (probes.env.SKILLWRIGHT_API_KEY) {
    checks.push({
      name: "LLM backend",
      status: "pass",
      detail: "Anthropic api backend (SKILLWRIGHT_API_KEY set)",
    });
  } else {
    const found = AGENT_BINARIES.find((b) => probes.which(b));
    checks.push(
      found
        ? { name: "LLM backend", status: "pass", detail: `agent-cli:${found} (found on PATH)` }
        : {
            name: "LLM backend",
            status: "fail",
            detail: `no agent CLI on PATH (looked for ${AGENT_BINARIES.join(", ")}) and no SKILLWRIGHT_API_KEY — semantic distill won't run`,
          },
    );
  }

  // Skill library dir.
  const lib = probes.env.SKILLWRIGHT_HOME ?? defaultLibraryDir();
  checks.push(
    probes.canWrite(lib)
      ? { name: "Skill library", status: "pass", detail: lib }
      : { name: "Skill library", status: "fail", detail: `${lib} is not writable` },
  );

  // Chromium for the --cdp replay path (relay path doesn't need it).
  checks.push(
    probes.chromiumInstalled()
      ? { name: "Chromium (--cdp replay)", status: "pass", detail: "installed" }
      : {
          name: "Chromium (--cdp replay)",
          status: "warn",
          detail:
            "not installed — run `pnpm --filter skillwright exec playwright install chromium` for --cdp replay (not needed for the relay path)",
        },
  );

  // Replay endpoint hint.
  checks.push(
    probes.env.CHROME_CDP_URL
      ? { name: "Replay endpoint", status: "pass", detail: `CHROME_CDP_URL=${probes.env.CHROME_CDP_URL}` }
      : {
          name: "Replay endpoint",
          status: "warn",
          detail: "no CHROME_CDP_URL — use `skillwright relay` to drive your real Chrome, or set --cdp",
        },
  );

  return { checks, ok: !checks.some((c) => c.status === "fail") };
}
