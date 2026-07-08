#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MultiSegmentError, type Recording } from "@bskill/shared";
import { distill } from "./distill";
import { writeSkillDirectory } from "./write-skill";
import { defaultLibraryDir } from "./paths";
import { promote } from "./quarantine";

function fail(msg: string): never {
  process.stderr.write(`bskill: ${msg}\n`);
  process.exit(1);
}

async function cmdDistill(argv: string[]): Promise<void> {
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) fail("usage: bskill distill <recording.json> [--name <slug>] [--semantic]");
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
      process.stderr.write(`bskill: replay failed\n${JSON.stringify(result.report, null, 2)}\n`);
      process.exit(2);
  }
}

async function cmdRun(argv: string[]): Promise<void> {
  const slug = argv.find((a) => !a.startsWith("--"));
  if (!slug) {
    fail("usage: bskill run <skill> [--relay [--port N] | --cdp <url>] [--confirm-destructive]");
  }
  const confirmDestructive = argv.includes("--confirm-destructive");

  if (argv.includes("--relay")) {
    const portFlag = argv.indexOf("--port");
    const port = portFlag >= 0 ? Number(argv[portFlag + 1]) : undefined;
    const { runSkillViaRelay } = await import("./relay-run");
    const result = await runSkillViaRelay(slug!, {
      confirmDestructive,
      port,
      onReady: ({ url, token }) => {
        process.stdout.write(
          `Relay listening on ${url}\n` +
            `In the bskill side panel: set port + token, then click Connect.\n` +
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
  const result = await runSkillByName(slug!, { confirmDestructive, cdpUrl });
  return reportResult(slug!, result);
}

function cmdPromote(argv: string[]): void {
  const slug = argv.find((a) => !a.startsWith("--"));
  if (!slug) fail("usage: bskill promote <skill> [--force]");
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

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "distill":
      return await cmdDistill(rest);
    case "run":
      return cmdRun(rest);
    case "promote":
      return cmdPromote(rest);
    default:
      fail(`unknown command "${cmd ?? ""}". commands: distill, run, promote`);
  }
}

void main();
