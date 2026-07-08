import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultLibraryDir } from "./paths";

export type InstallScope = "project" | "user";
export type LinkMode = "link" | "copy";

export interface InstallOptions {
  scope: InstallScope;
  /** Required for project scope. */
  projectDir?: string;
  /** Override the user base (defaults to homedir); injectable for tests. */
  userDir?: string;
  /** Override the global library root. */
  libraryDir?: string;
  /** Force the copy path (Windows / restricted FS parity, and tests). */
  forceCopy?: boolean;
}

export interface InstallLocation {
  path: string;
  mode: LinkMode;
}

export interface InstallResult {
  slug: string;
  locations: InstallLocation[];
}

interface ManifestEntry {
  slug: string;
  path: string;
  mode: LinkMode;
}

function manifestPath(libraryDir: string): string {
  return join(libraryDir, ".installs.json");
}

function loadManifest(libraryDir: string): ManifestEntry[] {
  const file = manifestPath(libraryDir);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as ManifestEntry[]) : [];
  } catch {
    return [];
  }
}

function saveManifest(libraryDir: string, entries: ManifestEntry[]): void {
  writeFileSync(manifestPath(libraryDir), JSON.stringify(entries, null, 2));
}

/** Record (or replace) an install in the manifest, keyed by its concrete path. */
function upsertManifest(libraryDir: string, entry: ManifestEntry): void {
  const entries = loadManifest(libraryDir).filter((e) => e.path !== entry.path);
  entries.push(entry);
  saveManifest(libraryDir, entries);
}

/** The two agent-ecosystem skill roots for a scope. */
function targetRoots(opts: InstallOptions): string[] {
  const base =
    opts.scope === "project"
      ? opts.projectDir ?? process.cwd()
      : opts.userDir ?? homedir();
  return [join(base, ".claude", "skills"), join(base, ".agents", "skills")];
}

/** Symlink the library skill into dest; copy on failure (or when forced). */
function linkOrCopy(librarySkill: string, dest: string, forceCopy: boolean): LinkMode {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  if (!forceCopy) {
    try {
      symlinkSync(librarySkill, dest, "dir");
      return "link";
    } catch {
      // fall through to copy
    }
  }
  cpSync(librarySkill, dest, { recursive: true });
  return "copy";
}

/**
 * Install a library skill into `.claude/skills/` and `.agents/skills/` at the
 * chosen scope (§6.4). Symlink-preferred so global-library heal promotions flow
 * through automatically; copy-fallback where symlinks are unavailable. Every
 * install is tracked with its mode so `list` can flag copies as stale-able.
 */
export function installSkill(slug: string, opts: InstallOptions): InstallResult {
  const libraryDir = opts.libraryDir ?? defaultLibraryDir();
  const librarySkill = join(libraryDir, slug);
  if (!existsSync(librarySkill)) {
    throw new Error(`skill "${slug}" is not in the library (${libraryDir})`);
  }
  const forceCopy = opts.forceCopy ?? false;
  const locations: InstallLocation[] = [];
  for (const root of targetRoots(opts)) {
    mkdirSync(root, { recursive: true });
    const dest = join(root, slug);
    const mode = linkOrCopy(librarySkill, dest, forceCopy);
    locations.push({ path: dest, mode });
    upsertManifest(libraryDir, { slug, path: dest, mode });
  }
  return { slug, locations };
}

export interface SkillListing {
  slug: string;
  installs: Array<{ path: string; mode: LinkMode; staleable: boolean }>;
}

/** List library skills with their install locations; copy-mode installs are
 * flagged stale-able (they don't track library promotions — run `bskill sync`). */
export function listSkills(libraryDir = defaultLibraryDir()): SkillListing[] {
  if (!existsSync(libraryDir)) return [];
  const manifest = loadManifest(libraryDir);
  const slugs = readdirSync(libraryDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
  return slugs.map((slug) => ({
    slug,
    installs: manifest
      .filter((m) => m.slug === slug)
      .map((m) => ({ path: m.path, mode: m.mode, staleable: m.mode === "copy" })),
  }));
}

/**
 * Refresh copy-mode installs from the library (symlinks track it automatically,
 * so they're skipped). Prunes manifest entries whose install path is gone.
 * Returns the number of copies refreshed.
 */
export function syncInstalls(libraryDir = defaultLibraryDir()): number {
  const entries = loadManifest(libraryDir);
  const kept: ManifestEntry[] = [];
  let refreshed = 0;
  for (const entry of entries) {
    if (!existsSync(entry.path)) continue; // install removed — prune
    kept.push(entry);
    if (entry.mode !== "copy") continue;
    const librarySkill = join(libraryDir, entry.slug);
    if (!existsSync(librarySkill)) continue;
    rmSync(entry.path, { recursive: true, force: true });
    cpSync(librarySkill, entry.path, { recursive: true });
    refreshed += 1;
  }
  saveManifest(libraryDir, kept);
  return refreshed;
}
