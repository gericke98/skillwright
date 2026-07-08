#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MultiSegmentError, type Recording } from "@skillwright/shared";
import { distill } from "./distill";
import { writeSkillDirectory } from "./write-skill";
import { defaultLibraryDir } from "./paths";
import { promote } from "./quarantine";
import { installSkill, listSkills, syncInstalls, type InstallScope } from "./install";
import { MissingInputError } from "./apply-inputs";
import { parseTimeoutMs } from "./run-args";

function fail(msg: string): never {
  process.stderr.write(`skillwright: ${msg}\n`);
  process.exit(1);
}

async function cmdDistill(argv: string[]): Promise<void> {
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) fail("usage: skillwright distill <recording.json> [--name <slug>] [--semantic]");
  const nameFlag = argv.indexOf("--name");
  const name = nameFlag >= 0 ? argv[nameFlag + 1] : undefined;
  const semantic = argv.includes("--semantic");

  let recording: Recording;
  try {
    recording = JSON.parse(readFileSync(file!, "utf8")) as Recording;
  } catch (e) {
    fail(`could not read recording ${file}: ${(e as Error).message}`);
  }

  try {
    let skill;
    if (semantic) {
      const { distillSemantic } = await import("./distill/semantic");
      const { createDefaultBackend } = await import("./llm/index");
      const backend = createDefaultBackend();
      process.stdout.write(`Distilling with ${backend.name}...\n`);
      skill = await distillSemantic(recording!, backend, { name });
    } else {
      skill = distill(recording!, { name });
    }
    const dir = writeSkillDirectory(skill, defaultLibraryDir());
    process.stdout.write(`Distilled skill "${skill.slug}" → ${dir}\n`);
  } catch (e) {
    if (e instanceof MultiSegmentError) fail(e.message);
    throw e;
  }
}

function reportResult(slug: string, result: Awaited<ReturnType<typeof import("./run")["runSkillByName"]>>): void {
  switch (result.status) {
    case "ok":
      process.stdout.write(`✓ replayed "${slug}" successfully\n`);
      return;
    case "needs-confirmation":
      fail(
        `step ${result.report.stepIndex} is ${result.report.effect}; re-run with --confirm-destructive`,
      );
      break;
    case "failed":
      process.stderr.write(`skillwright: replay failed\n${JSON.stringify(result.report, null, 2)}\n`);
      process.exit(2);
  }
}

/** Collect repeatable `--input k=v` flags into an inputs map. */
function parseInputs(argv: string[]): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") {
      const kv = argv[i + 1] ?? "";
      const eq = kv.indexOf("=");
      if (eq > 0) inputs[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
  }
  return inputs;
}

async function cmdRun(argv: string[]): Promise<void> {
  const slug = argv.find((a) => !a.startsWith("--") && !a.includes("="));
  if (!slug) {
    fail(
      "usage: skillwright run <skill> [--input k=v ...] [--relay [--port N] | --cdp <url>] [--confirm-destructive] [--timeout <seconds>]",
    );
  }
  const confirmDestructive = argv.includes("--confirm-destructive");
  const apiReplay = argv.includes("--api");
  const inputs = parseInputs(argv);
  const timeoutMs = parseTimeoutMs(argv);
  if (timeoutMs !== undefined && argv.includes("--relay")) {
    process.stderr.write(
      "skillwright: --timeout applies to --cdp replay only; the relay path times out in the extension. Ignoring.\n",
    );
  }

  try {
    if (argv.includes("--relay")) {
      const portFlag = argv.indexOf("--port");
      const port = portFlag >= 0 ? Number(argv[portFlag + 1]) : undefined;
      const { runSkillViaRelay } = await import("./relay-run");
      const result = await runSkillViaRelay(slug!, {
        confirmDestructive,
        port,
        inputs,
        onReady: ({ url, token }) => {
          process.stdout.write(
            `Relay listening on ${url}\n` +
              `In the skillwright side panel: set port + token, then click Connect.\n` +
              `  token: ${token}\n` +
              `Waiting for the extension to pair...\n`,
          );
        },
      });
      return reportResult(slug!, result);
    }

    const cdpFlag = argv.indexOf("--cdp");
    const cdpUrl = (cdpFlag >= 0 ? argv[cdpFlag + 1] : undefined) ?? process.env.CHROME_CDP_URL ?? "";
    if (!cdpUrl) {
      fail("no endpoint. Use --relay, or --cdp <url> / CHROME_CDP_URL for a debug-profile Chrome.");
    }
    const { runSkillByName } = await import("./run");
    const result = await runSkillByName(slug!, { confirmDestructive, cdpUrl, inputs, apiReplay, timeoutMs });
    return reportResult(slug!, result);
  } catch (e) {
    if (e instanceof MissingInputError) fail(`${e.message} — pass them with --input <name>=<value>`);
    throw e;
  }
}

function cmdPromote(argv: string[]): void {
  const slug = argv.find((a) => !a.startsWith("--"));
  if (!slug) fail("usage: skillwright promote <skill> [--force]");
  const force = argv.includes("--force");
  const dir = join(defaultLibraryDir(), slug!);
  const result = promote(dir, { force });
  if (result.promoted === 0) {
    process.stdout.write(
      `No candidates promoted for "${slug}" (need clean confirmations, or pass --force).\n`,
    );
  } else {
    process.stdout.write(`Promoted ${result.promoted} healed selector(s) for "${slug}".\n`);
  }
}

function cmdInstall(argv: string[]): void {
  const all = argv.includes("--all");
  const slug = argv.find((a) => !a.startsWith("--"));
  if (!all && !slug) fail("usage: skillwright install [<skill>|--all] [--project <dir>|--user]");

  const projectFlag = argv.indexOf("--project");
  const scope: InstallScope = argv.includes("--user") ? "user" : "project";
  const projectDir = projectFlag >= 0 ? argv[projectFlag + 1] : process.cwd();

  const slugs = all ? listSkills().map((s) => s.slug) : [slug!];
  if (slugs.length === 0) fail("no skills in the library to install");
  for (const s of slugs) {
    const result = installSkill(s, { scope, projectDir });
    const modes = result.locations.map((l) => `${l.path} (${l.mode})`).join(", ");
    process.stdout.write(`Installed "${s}" → ${modes}\n`);
  }
}

function cmdList(): void {
  const listing = listSkills();
  if (listing.length === 0) {
    process.stdout.write("No skills in the library. Distill one with `skillwright distill`.\n");
    return;
  }
  for (const skill of listing) {
    process.stdout.write(`${skill.slug}\n`);
    for (const i of skill.installs) {
      process.stdout.write(`  ${i.mode === "link" ? "linked" : "copied"} → ${i.path}${i.staleable ? " (stale-able; run `skillwright sync`)" : ""}\n`);
    }
  }
}

function cmdSync(): void {
  const n = syncInstalls();
  process.stdout.write(`Refreshed ${n} copy-mode install(s).\n`);
}

async function cmdMcp(): Promise<void> {
  const { startMcpServer } = await import("./mcp/index");
  const { runSkillByName } = await import("./run");
  // Expose installed skills as MCP tools for any MCP client. Each tool call runs
  // the skill against a CDP endpoint; destructive steps stay gated (opt in per
  // call with confirm_destructive:true). stdout is the JSON-RPC channel.
  await startMcpServer({
    input: process.stdin,
    output: process.stdout,
    runSkill: async (slug, args) => {
      const cdpUrl = process.env.CHROME_CDP_URL ?? "";
      if (!cdpUrl) {
        return {
          status: "failed",
          report: {
            stepIndex: -1,
            effect: "readonly",
            selectorsTried: [],
            reason: "no CDP endpoint — start `skillwright relay` and set CHROME_CDP_URL",
          },
        };
      }
      // Tool arguments become skill inputs; `confirm_destructive` is a control key.
      const inputs: Record<string, string> = {};
      for (const [k, v] of Object.entries(args)) {
        if (k !== "confirm_destructive") inputs[k] = String(v);
      }
      try {
        return await runSkillByName(slug, {
          confirmDestructive: args.confirm_destructive === true,
          cdpUrl,
          inputs,
        });
      } catch (e) {
        if (e instanceof MissingInputError) {
          return {
            status: "failed",
            report: { stepIndex: -1, effect: "readonly", selectorsTried: [], reason: e.message },
          };
        }
        throw e;
      }
    },
  });
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "distill":
      return await cmdDistill(rest);
    case "run":
      return cmdRun(rest);
    case "promote":
      return cmdPromote(rest);
    case "install":
      return cmdInstall(rest);
    case "list":
      return cmdList();
    case "sync":
      return cmdSync();
    case "mcp":
      return await cmdMcp();
    default:
      fail(
        `unknown command "${cmd ?? ""}". commands: distill, run, promote, install, list, sync, mcp`,
      );
  }
}

void main();
