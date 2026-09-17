import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TallyClient } from "../tally-client.js";
import { toJsonContent, toTextError } from "../format.js";

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

/** Registers a report tool that takes an optional as-of date (SVTODATE only). */
function registerAsOfDateReport(
  server: McpServer,
  client: () => TallyClient,
  toolName: string,
  reportName: string,
  description: string
) {
  server.tool(
    toolName,
    description,
    { asOfDate: dateArg("Reporting date") },
    async ({ asOfDate }) => {
      try {
        const date = toTallyDate(asOfDate);
        const data = await client().exportReport(reportName, date ? { SVTODATE: date } : {});
        return toJsonContent(data);
      } catch (err) {
        return toTextError(err);
      }
    }
  );
}

/** Registers a report tool that takes an optional date range (SVFROMDATE/SVTODATE). */
function registerDateRangeReport(
  server: McpServer,
  client: () => TallyClient,
  toolName: string,
  reportName: string,
  description: string
) {
  server.tool(
    toolName,
    description,
    { fromDate: dateArg("Period start"), toDate: dateArg("Period end") },
    async ({ fromDate, toDate }) => {
      try {
        const staticVars: Record<string, string> = {};
        const from = toTallyDate(fromDate);
        const to = toTallyDate(toDate);
        if (from) staticVars.SVFROMDATE = from;
        if (to) staticVars.SVTODATE = to;
        const data = await client().exportReport(reportName, staticVars);
        return toJsonContent(data);
      } catch (err) {
        return toTextError(err);
      }
    }
  );
}

export function registerReportTools(server: McpServer, client: () => TallyClient) {
  // --- Financial statements ---
  registerAsOfDateReport(server, client, "get_balance_sheet", "Balance Sheet",
    "Fetch the Balance Sheet report for the active company as of a given date.");

  registerDateRangeReport(server, client, "get_profit_and_loss", "Profit and Loss",
    "Fetch the Profit and Loss statement for the active company over a date range.");

  registerAsOfDateReport(server, client, "get_trial_balance", "Trial Balance",
    "Fetch the Trial Balance report for the active company as of a given date.");

  registerDateRangeReport(server, client, "get_cash_flow", "Cash Flow",
    "Fetch the Cash Flow statement for the active company over a date range.");

  registerDateRangeReport(server, client, "get_funds_flow", "Funds Flow",
    "Fetch the Funds Flow statement for the active company over a date range.");

  registerDateRangeReport(server, client, "get_ratio_analysis", "Ratio Analysis",
    "Fetch the Ratio Analysis report (key accounting ratios) for the active company over a date range.");

  // --- Books & registers ---
  registerDateRangeReport(server, client, "get_day_book", "Day Book",
    "Fetch the Day Book (chronological transaction listing) for the active company over a date range.");

  registerDateRangeReport(server, client, "get_sales_register", "Sales Register",
    "Fetch the Sales Register (all sales vouchers) for the active company over a date range.");

  registerDateRangeReport(server, client, "get_purchase_register", "Purchase Register",
    "Fetch the Purchase Register (all purchase vouchers) for the active company over a date range.");

  // --- Outstanding / receivables & payables ---
  registerAsOfDateReport(server, client, "get_receivables", "Bills Receivable",
    "Fetch the Outstanding Receivables (Bills Receivable) report for the active company as of a given date.");

  registerAsOfDateReport(server, client, "get_payables", "Bills Payable",
    "Fetch the Outstanding Payables (Bills Payable) report for the active company as of a given date.");

  // --- Inventory ---
  registerAsOfDateReport(server, client, "get_stock_summary", "Stock Summary",
    "Fetch the Stock Summary report (inventory quantities and values) for the active company as of a given date.");

  registerDateRangeReport(server, client, "get_movement_analysis", "Movement Analysis",
    "Fetch the Movement Analysis report (stock item inward/outward movement) for the active company over a date range.");

  // --- Generic escape hatch for any other standard/statutory report ---
  server.tool(
    "get_custom_report",
    "Fetch any other standard TallyPrime report by its exact report name (as it would be requested over the XML/HTTP " +
      "gateway), for reports not covered by a dedicated tool - e.g. GST returns (\"GSTR-1\", \"GSTR-3B\"), " +
      "\"Group Summary\", \"List of Accounts\", \"Negative Stock\", \"Reorder Status\", or any custom/TDL report name. " +
      "Optional date range and extra static variables (e.g. SVVIEWNAME, SVGSTIN, SVSTATNAME) can be passed through as needed.",
    {
      reportName: z.string().describe('Exact Tally report name, e.g. "Group Summary" or "GSTR-1".'),
      fromDate: dateArg("Period start"),
      toDate: dateArg("Period end"),
      staticVariables: z
        .record(z.string())
        .optional()
        .describe('Extra Tally static variables to pass, e.g. {"SVVIEWNAME": "Accounting Voucher View"}.'),
    },
    async ({ reportName, fromDate, toDate, staticVariables }) => {
      try {
        const staticVars: Record<string, string> = { ...staticVariables };
        const from = toTallyDate(fromDate);
        const to = toTallyDate(toDate);
        if (from) staticVars.SVFROMDATE = from;
        if (to) staticVars.SVTODATE = to;
        const data = await client().exportReport(reportName, staticVars);
        return toJsonContent(data);
      } catch (err) {
        return toTextError(err);
      }
    }
  );
}
