import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TallyClient } from "../tally-client.js";
import { toTextError } from "../format.js";

function dateArg(label: string) {
  return z.string().optional().describe(`${label} as YYYY-MM-DD or YYYYMMDD. Defaults to Tally's current period.`);
}

function toTallyDate(input?: string): string | undefined {
  if (!input) return undefined;
  const digits = input.replace(/-/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`Invalid date "${input}". Use YYYY-MM-DD or YYYYMMDD.`);
  }
  return digits;
}

function toReportText(raw: any) {
  return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
}

export function registerReportTools(server: McpServer, client: () => TallyClient) {
  server.tool(
    "get_balance_sheet",
    "Fetch the Balance Sheet report for the active company as of a given date.",
    { asOfDate: dateArg("Reporting date") },
    async ({ asOfDate }) => {
      try {
        const date = toTallyDate(asOfDate);
        const data = await client().exportReport("Balance Sheet", date ? { SVTODATE: date } : {});
        return toReportText(data);
      } catch (err) {
        return toTextError(err);
      }
    }
  );

  server.tool(
    "get_profit_and_loss",
    "Fetch the Profit and Loss statement for the active company over a date range.",
    { fromDate: dateArg("Period start"), toDate: dateArg("Period end") },
    async ({ fromDate, toDate }) => {
      try {
        const staticVars: Record<string, string> = {};
        const from = toTallyDate(fromDate);
        const to = toTallyDate(toDate);
        if (from) staticVars.SVFROMDATE = from;
        if (to) staticVars.SVTODATE = to;
        const data = await client().exportReport("Profit and Loss", staticVars);
        return toReportText(data);
      } catch (err) {
        return toTextError(err);
      }
    }
  );

  server.tool(
    "get_trial_balance",
    "Fetch the Trial Balance report for the active company as of a given date.",
    { asOfDate: dateArg("Reporting date") },
    async ({ asOfDate }) => {
      try {
        const date = toTallyDate(asOfDate);
        const data = await client().exportReport("Trial Balance", date ? { SVTODATE: date } : {});
        return toReportText(data);
      } catch (err) {
        return toTextError(err);
      }
    }
  );

  server.tool(
    "get_day_book",
    "Fetch the Day Book (chronological transaction listing) for the active company over a date range.",
    { fromDate: dateArg("Period start"), toDate: dateArg("Period end") },
    async ({ fromDate, toDate }) => {
      try {
        const staticVars: Record<string, string> = {};
        const from = toTallyDate(fromDate);
        const to = toTallyDate(toDate);
        if (from) staticVars.SVFROMDATE = from;
        if (to) staticVars.SVTODATE = to;
        const data = await client().exportReport("Day Book", staticVars);
        return toReportText(data);
      } catch (err) {
        return toTextError(err);
      }
    }
  );
}
