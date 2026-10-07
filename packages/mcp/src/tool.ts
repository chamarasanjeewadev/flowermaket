/**
 * Tool definition + registration helper.
 *
 * Every tool declares a `kind`:
 * - "read"  — no side effects; safe to auto-allow.
 * - "write" — changes the database.
 * - "send"  — sends a WhatsApp message to a real person (may also write).
 * Read-only mode registers only "read" tools. Kinds also drive the MCP
 * annotations clients use to decide what needs a confirmation.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ActionResult } from "@flowers/api";
import type { Ctx } from "./context";

export type ToolKind = "read" | "write" | "send";

export interface ToolDef<S extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  input: S;
  run: (args: z.infer<z.ZodObject<S>>, ctx: Ctx) => Promise<ActionResult<unknown>>;
}

/** Erases the shape parameter so tools of different shapes fit one array. */
export interface AnyTool {
  name: string;
  kind: ToolKind;
  register: (server: McpServer, ctx: Ctx) => void;
}

export function defineTool<S extends z.ZodRawShape>(def: ToolDef<S>): AnyTool {
  return {
    name: def.name,
    kind: def.kind,
    register(server, ctx) {
      const schema = z.object(def.input);
      // Widen to the non-generic shape so the SDK's callback type resolves;
      // `schema` keeps the precise type for the handler.
      const inputSchema: z.ZodRawShape = def.input;
      server.registerTool(
        def.name,
        {
          title: def.title,
          description: def.description,
          inputSchema,
          annotations: {
            title: def.title,
            readOnlyHint: def.kind === "read",
            destructiveHint: def.kind !== "read",
            openWorldHint: def.kind === "send",
          },
        },
        // The SDK validates args against inputSchema before calling us; we
        // re-parse with the same schema to get defaults applied and a
        // precise type without casting.
        async (raw): Promise<CallToolResult> => {
          const parsed = schema.safeParse(raw);
          if (!parsed.success) {
            return errorResult("validation", z.prettifyError(parsed.error));
          }
          try {
            return renderResult(await def.run(parsed.data, ctx));
          } catch (e) {
            return errorResult("unknown", describeError(e));
          }
        },
      );
    },
  };
}

export function renderResult(result: ActionResult<unknown>): CallToolResult {
  if (!result.ok) return errorResult(result.code, result.message);
  const text =
    result.data === undefined ? "Done." : JSON.stringify(result.data, null, 2);
  return { content: [{ type: "text", text }] };
}

/**
 * Drizzle wraps driver errors as "Failed query: <sql>" with the real reason
 * (connection refused, missing column…) on `cause` — surface that, not the SQL.
 */
export function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = e.cause instanceof Error ? e.cause.message : null;
  const head = e.message.startsWith("Failed query:") ? "Database query failed" : e.message;
  return cause ? `${head}: ${cause}` : head;
}

export function errorResult(code: string, message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: `${code}: ${message}` }] };
}

/** Shared zod pieces. */
export const uuid = (what: string) => z.string().uuid().describe(`${what} (UUID)`);
export const cents = (what: string) =>
  z
    .number()
    .int()
    .nonnegative()
    .describe(`${what} in integer LKR cents (Rs 1,250.00 = 125000)`);
