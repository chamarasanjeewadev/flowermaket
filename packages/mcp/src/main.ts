/**
 * Entry point: `pnpm --filter @flowers/mcp start` (stdio). stdout carries the
 * MCP protocol, so all diagnostics go to stderr.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createContext } from "./context";
import { envFilesFromProcess, isReadOnly, loadEnvFiles } from "./env";
import { createServer } from "./server";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const { loaded } = loadEnvFiles(repoRoot, envFilesFromProcess());
const readOnly = isReadOnly();

const server = createServer(createContext(), { readOnly });
await server.connect(new StdioServerTransport());

console.error(
  `[flowers-mcp] ready (${readOnly ? "read-only" : "read/write"}); env from: ${
    loaded.length ? loaded.join(", ") : "process only"
  }${process.env.DATABASE_URL ? "" : " — WARNING: DATABASE_URL not set"}`,
);
