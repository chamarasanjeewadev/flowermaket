import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { err, type AppEnv } from "@flowers/api";
import type { Ctx } from "./context";
import { allTools, createServer } from "./server";

/** A context with no database: any tool that reaches the DB fails loudly. */
const offlineCtx: Ctx = {
  env: () => ({}) as AppEnv,
  db: () => {
    throw new Error("no database in tests");
  },
  actingAdmin: async () => err("auth_required", "Set FLOWERS_ADMIN_EMAIL"),
  evolution: () => ({ apiUrl: "", apiKey: "", instance: "" }),
};

async function connect(readOnly: boolean): Promise<Client> {
  const server = createServer(offlineCtx, { readOnly });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);
  return client;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? "").join("");
}

describe("flowers MCP server", () => {
  it("has unique tool names", () => {
    const names = allTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("exposes every tool in read/write mode with matching annotations", async () => {
    const client = await connect(false);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(allTools.length);

    const send = tools.find((t) => t.name === "send_whatsapp_reply");
    expect(send?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    const read = tools.find((t) => t.name === "get_order");
    expect(read?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });

  it("hides write and send tools in read-only mode", async () => {
    const client = await connect(true);
    const names = (await client.listTools()).tools.map((t) => t.name);
    const reads = allTools.filter((t) => t.kind === "read").map((t) => t.name);
    expect(names.sort()).toEqual(reads.sort());
    expect(names).not.toContain("send_whatsapp_reply");
    expect(names).not.toContain("create_order");
  });

  it("rejects invalid input before touching the database", async () => {
    const client = await connect(false);
    const res = await client.callTool({ name: "get_order", arguments: { orderId: "nope" } });
    expect(res.isError).toBe(true);
  });

  it("refuses writes without an acting admin", async () => {
    const client = await connect(false);
    const res = await client.callTool({
      name: "create_order",
      arguments: {
        customerName: "Nimali",
        customerPhone: "0771234567",
        items: [{ descriptionEn: "Red roses", quantity: 24, unit: "stems" }],
      },
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("auth_required");
  });

  it("requires a reason to block a product", async () => {
    const client = await connect(false);
    const res = await client.callTool({
      name: "moderate_product",
      arguments: { productId: "7f1c2b8e-0c43-4e0e-9b55-2f3c0a1d9e11", status: "blocked" },
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("reason");
  });

  it("turns thrown errors into tool errors instead of crashing", async () => {
    const client = await connect(false);
    const res = await client.callTool({ name: "list_orders", arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("no database in tests");
  });
});
