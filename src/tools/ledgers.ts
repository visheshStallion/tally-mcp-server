import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TallyClient } from "../tally-client.js";
import { asArray, toJsonContent, toTextError, unwrapValue } from "../format.js";

const LEDGER_FIELDS = ["NAME", "PARENT", "OPENINGBALANCE", "CLOSINGBALANCE", "GSTIN", "MAILINGNAME"];

export function registerLedgerTools(server: McpServer, client: () => TallyClient) {
  server.tool(
    "list_ledgers",
    "List all ledger accounts (chart of accounts) in the active Tally company, including opening/closing balances.",
    {
      nameContains: z.string().optional().describe("Only return ledgers whose name contains this substring (case-sensitive, as stored in Tally)."),
    },
    async ({ nameContains }) => {
      try {
        const collection = await client().fetchCollection("Ledger", LEDGER_FIELDS);
        let ledgers = asArray(collection.LEDGER).map((l: any) => ({
          name: unwrapValue(l.NAME ?? l["@_NAME"]),
          parent: unwrapValue(l.PARENT),
          openingBalance: unwrapValue(l.OPENINGBALANCE),
          closingBalance: unwrapValue(l.CLOSINGBALANCE),
          gstin: unwrapValue(l.GSTIN),
          mailingName: unwrapValue(l.MAILINGNAME),
        }));
        if (nameContains) {
          ledgers = ledgers.filter((l) => l.name?.includes(nameContains));
        }
        return toJsonContent({ count: ledgers.length, ledgers });
      } catch (err) {
        return toTextError(err);
      }
    }
  );

  server.tool(
    "get_ledger",
    "Get details and current balance for a single ledger account by exact name.",
    {
      name: z.string().describe("Exact ledger name as it appears in Tally."),
    },
    async ({ name }) => {
      try {
        const collection = await client().fetchCollection("Ledger", LEDGER_FIELDS, {
          filters: [`$Name = "${name.replace(/"/g, '\\"')}"`],
        });
        const ledgers = asArray(collection.LEDGER);
        if (ledgers.length === 0) {
          return toJsonContent({ found: false, message: `No ledger named "${name}" found.` });
        }
        const l: any = ledgers[0];
        return toJsonContent({
          found: true,
          ledger: {
            name: unwrapValue(l.NAME),
            parent: unwrapValue(l.PARENT),
            openingBalance: unwrapValue(l.OPENINGBALANCE),
            closingBalance: unwrapValue(l.CLOSINGBALANCE),
            gstin: unwrapValue(l.GSTIN),
            mailingName: unwrapValue(l.MAILINGNAME),
          },
        });
      } catch (err) {
        return toTextError(err);
      }
    }
  );

  server.tool(
    "list_groups",
    "List all ledger groups (account classification hierarchy, e.g. Sundry Debtors, Current Assets) in the active company.",
    {},
    async () => {
      try {
        const collection = await client().fetchCollection("Group", ["NAME", "PARENT"]);
        const groups = asArray(collection.GROUP).map((g: any) => ({
          name: unwrapValue(g.NAME),
          parent: unwrapValue(g.PARENT),
        }));
        return toJsonContent({ count: groups.length, groups });
      } catch (err) {
        return toTextError(err);
      }
    }
  );
}
