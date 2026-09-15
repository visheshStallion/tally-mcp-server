import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TallyClient } from "../tally-client.js";
import { toJsonContent, toTextError, unwrapValue } from "../format.js";

export function registerCompanyTools(server: McpServer, client: () => TallyClient) {
  server.tool(
    "list_companies",
    "List the companies currently open/loaded in Tally.",
    {},
    async () => {
      try {
        const data = await client().exportReport("List of Companies");
        const companies = data?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY ?? [];
        const names = (Array.isArray(companies) ? companies : [companies])
          .filter(Boolean)
          .map((c: any) => unwrapValue(c?.["@_NAME"] ?? c?.NAME ?? c));
        return toJsonContent({ companies: names });
      } catch (err) {
        return toTextError(err);
      }
    }
  );
}
