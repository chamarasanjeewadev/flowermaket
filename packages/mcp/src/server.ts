import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Ctx } from "./context";
import type { AnyTool } from "./tool";
import { marketplaceTools } from "./tools/marketplace";
import { orderTools } from "./tools/orders";
import { whatsappTools } from "./tools/whatsapp";

export const allTools: readonly AnyTool[] = [...marketplaceTools, ...orderTools, ...whatsappTools];

const INSTRUCTIONS = `FlowerMarket.lk admin operations (Sri Lanka flower marketplace).
- Money is always integer LKR cents (Rs 1,250.00 = 125000). Never pass rupees or floats.
- Order lifecycle: draft → sourcing (RFQs sent) → quoted → confirmed → invoiced → paid → fulfilling → completed.
- Documents: quotation → (accepted) → invoice → (paid) → receipt. Draft, then issue, then send_document_link.
- Tools whose description says SEND message a real person on WhatsApp. Show the exact text to the operator before sending.
- Customer-facing text may be English or Sinhala; match the customer's language.`;

export function createServer(ctx: Ctx, opts: { readOnly: boolean }): McpServer {
  const server = new McpServer(
    { name: "flowers", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );
  for (const tool of allTools) {
    if (opts.readOnly && tool.kind !== "read") continue;
    tool.register(server, ctx);
  }
  return server;
}
