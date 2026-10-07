/**
 * Environment loading for the local MCP server.
 *
 * Unlike the Workers apps, this is a long-lived Node process, so env is read
 * once at startup. Values already present in `process.env` always win (so an
 * MCP client config can override anything), then the first file to define a
 * key wins in the order given.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

/**
 * Default env sources relative to the repo root. `packages/mcp/.env` holds the
 * production portal URLs + EVOLUTION_* + FLOWERS_ADMIN_EMAIL (see
 * `.env.example`); the root `.env` supplies DATABASE_URL. The apps' `.dev.vars`
 * are deliberately NOT read: they carry localhost portal URLs and placeholder
 * Evolution creds, which would put dead links into real WhatsApp messages.
 */
export const DEFAULT_ENV_FILES = ["packages/mcp/.env", ".env"] as const;

/** Keys the apps read under a VITE_ prefix that the shared `getEnv()` expects bare. */
const ALIASES: ReadonlyArray<readonly [target: string, source: string]> = [
  ["SUPABASE_URL", "VITE_SUPABASE_URL"],
  ["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"],
];

export interface LoadEnvResult {
  /** Files that existed and were read. */
  loaded: string[];
}

export function loadEnvFiles(
  repoRoot: string,
  files: readonly string[],
  target: NodeJS.ProcessEnv = process.env,
): LoadEnvResult {
  const loaded: string[] = [];
  for (const rel of files) {
    const path = resolve(repoRoot, rel);
    if (!existsSync(path)) continue;
    const parsed = parseEnv(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined && !target[key]) target[key] = value;
    }
    loaded.push(path);
  }
  for (const [to, from] of ALIASES) {
    if (!target[to] && target[from]) target[to] = target[from];
  }
  return { loaded };
}

/** `FLOWERS_ENV_FILES` (comma-separated, repo-relative or absolute) overrides the defaults. */
export function envFilesFromProcess(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.FLOWERS_ENV_FILES?.trim();
  if (!raw) return [...DEFAULT_ENV_FILES];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `FLOWERS_MCP_READ_ONLY=1` hides every tool that writes or sends. */
export function isReadOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FLOWERS_MCP_READ_ONLY === "1";
}
