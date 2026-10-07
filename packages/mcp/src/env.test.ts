import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { envFilesFromProcess, isReadOnly, loadEnvFiles } from "./env";

function repoWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "flowers-mcp-env-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

describe("loadEnvFiles", () => {
  it("lets process env win, then the first file that defines a key", () => {
    const root = repoWith({
      "a.vars": 'DATABASE_URL="postgres://a"\nEVOLUTION_INSTANCE=sda\n',
      "b.env": "DATABASE_URL=postgres://b\nWEB_PUBLIC_URL=https://x\n",
    });
    const target: NodeJS.ProcessEnv = { EVOLUTION_INSTANCE: "from-process" };
    const { loaded } = loadEnvFiles(root, ["a.vars", "missing.env", "b.env"], target);

    expect(loaded).toHaveLength(2);
    expect(target.DATABASE_URL).toBe("postgres://a");
    expect(target.EVOLUTION_INSTANCE).toBe("from-process");
    expect(target.WEB_PUBLIC_URL).toBe("https://x");
  });

  it("maps VITE_SUPABASE_* onto the bare names getEnv() reads", () => {
    const root = repoWith({ ".env": "VITE_SUPABASE_URL=https://ref.supabase.co\n" });
    const target: NodeJS.ProcessEnv = {};
    loadEnvFiles(root, [".env"], target);
    expect(target.SUPABASE_URL).toBe("https://ref.supabase.co");
  });
});

describe("process flags", () => {
  it("parses FLOWERS_ENV_FILES and defaults otherwise", () => {
    expect(envFilesFromProcess({})).toEqual(["packages/mcp/.env", ".env"]);
    expect(envFilesFromProcess({ FLOWERS_ENV_FILES: " .env.prod , x " })).toEqual([".env.prod", "x"]);
  });

  it("is read-only only for exactly 1", () => {
    expect(isReadOnly({ FLOWERS_MCP_READ_ONLY: "1" })).toBe(true);
    expect(isReadOnly({ FLOWERS_MCP_READ_ONLY: "true" })).toBe(false);
    expect(isReadOnly({})).toBe(false);
  });
});
