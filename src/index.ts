#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TallyClient } from "./tally-client.js";
import { registerCompanyTools } from "./tools/companies.js";
import { registerLedgerTools } from "./tools/ledgers.js";
import { registerStockItemTools } from "./tools/stock-items.js";
import { registerVoucherTools } from "./tools/vouchers.js";
import { registerReportTools } from "./tools/reports.js";

const TALLY_URL = process.env.TALLY_URL ?? "http://localhost:9000";
const TALLY_COMPANY = process.env.TALLY_COMPANY;

const tallyClient = new TallyClient({ url: TALLY_URL, company: TALLY_COMPANY });

const server = new McpServer({
  name: "tally-mcp-server",
  version: "0.1.0",
});

const getClient = () => tallyClient;

registerCompanyTools(server, getClient);
registerLedgerTools(server, getClient);
registerStockItemTools(server, getClient);
registerVoucherTools(server, getClient);
registerReportTools(server, getClient);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`tally-mcp-server running (Tally gateway: ${TALLY_URL}${TALLY_COMPANY ? `, company: ${TALLY_COMPANY}` : ""})`);
}

main().catch((err) => {
  console.error("Fatal error starting tally-mcp-server:", err);
  process.exit(1);
});
