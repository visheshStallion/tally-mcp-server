import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TallyClient } from "../tally-client.js";
import { asArray, toJsonContent, toTextError, unwrapValue } from "../format.js";

const STOCK_FIELDS = ["NAME", "PARENT", "BASEUNITS", "CLOSINGBALANCE", "CLOSINGVALUE", "CLOSINGRATE"];

export function registerStockItemTools(server: McpServer, client: () => TallyClient) {
  server.tool(
    "list_stock_items",
    "List inventory/stock items in the active Tally company, including closing stock quantity and value.",
    {
      nameContains: z.string().optional().describe("Only return stock items whose name contains this substring."),
    },
    async ({ nameContains }) => {
      try {
        const collection = await client().fetchCollection("StockItem", STOCK_FIELDS);
        let items = asArray(collection.STOCKITEM).map((s: any) => ({
          name: unwrapValue(s.NAME),
          parent: unwrapValue(s.PARENT),
          baseUnit: unwrapValue(s.BASEUNITS),
          closingBalance: unwrapValue(s.CLOSINGBALANCE),
          closingValue: unwrapValue(s.CLOSINGVALUE),
          closingRate: unwrapValue(s.CLOSINGRATE),
        }));
        if (nameContains) {
          items = items.filter((i) => i.name?.includes(nameContains));
        }
        return toJsonContent({ count: items.length, stockItems: items });
      } catch (err) {
        return toTextError(err);
      }
    }
  );

  server.tool(
    "get_stock_item",
    "Get details for a single stock item by exact name.",
    {
      name: z.string().describe("Exact stock item name as it appears in Tally."),
    },
    async ({ name }) => {
      try {
        const collection = await client().fetchCollection("StockItem", STOCK_FIELDS, {
          filters: [`$Name = "${name.replace(/"/g, '\\"')}"`],
        });
        const items = asArray(collection.STOCKITEM);
        if (items.length === 0) {
          return toJsonContent({ found: false, message: `No stock item named "${name}" found.` });
        }
        const s: any = items[0];
        return toJsonContent({
          found: true,
          stockItem: {
            name: unwrapValue(s.NAME),
            parent: unwrapValue(s.PARENT),
            baseUnit: unwrapValue(s.BASEUNITS),
            closingBalance: unwrapValue(s.CLOSINGBALANCE),
            closingValue: unwrapValue(s.CLOSINGVALUE),
            closingRate: unwrapValue(s.CLOSINGRATE),
          },
        });
      } catch (err) {
        return toTextError(err);
      }
    }
  );
}
