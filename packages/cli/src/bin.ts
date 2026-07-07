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

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "distill":
      return cmdDistill(rest);
    default:
      fail(`unknown command "${cmd ?? ""}". commands: distill`);
  }
}

main();
