#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { MultiSegmentError, type Recording } from "@bskill/shared";
import { distill } from "./distill";
import { writeSkillDirectory } from "./write-skill";
import { defaultLibraryDir } from "./paths";

function fail(msg: string): never {
  process.stderr.write(`bskill: ${msg}\n`);
  process.exit(1);
}

function cmdDistill(argv: string[]): void {
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) fail("usage: bskill distill <recording.json> [--name <slug>]");
  const nameFlag = argv.indexOf("--name");
  const name = nameFlag >= 0 ? argv[nameFlag + 1] : undefined;

  let recording: Recording;
  try {
    recording = JSON.parse(readFileSync(file!, "utf8")) as Recording;
  } catch (e) {
    fail(`could not read recording ${file}: ${(e as Error).message}`);
  }

  try {
    const skill = distill(recording!, { name });
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

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "distill":
      return cmdDistill(rest);
    case "run":
      return cmdRun(rest);
    default:
      fail(`unknown command "${cmd ?? ""}". commands: distill, run`);
  }
}

void main();
