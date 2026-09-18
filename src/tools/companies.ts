import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TallyClient } from "../tally-client.js";
import { toJsonContent, toTextError } from "../format.js";

export function registerCompanyTools(server: McpServer, client: () => TallyClient) {
  server.tool(
    "list_companies",
    "List the companies currently open/loaded in Tally.",
    {},
    async () => {
      try {
        const companies = await client().listCompanies();
        return toJsonContent({ companies });
      } catch (err) {
        return toTextError(err);
      }
    }
  );
}
