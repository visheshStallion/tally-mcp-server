import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TallyClient, xmlEscape } from "../tally-client.js";
import { asArray, toJsonContent, toTextError, unwrapValue } from "../format.js";

const VOUCHER_FIELDS = ["DATE", "VOUCHERTYPENAME", "VOUCHERNUMBER", "PARTYLEDGERNAME", "NARRATION", "AMOUNT"];

/** Normalizes a user-supplied date (YYYY-MM-DD or YYYYMMDD) into Tally's YYYYMMDD format. */
function toTallyDate(input: string): string {
  const digits = input.replace(/-/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`Invalid date "${input}". Use YYYY-MM-DD or YYYYMMDD.`);
  }
  return digits;
}

export function registerVoucherTools(server: McpServer, client: () => TallyClient) {
  server.tool(
    "list_vouchers",
    "List transaction vouchers (Sales, Purchase, Payment, Receipt, Journal, etc.) in the active company within a date range. " +
      "Vouchers flagged as deleted (via the UDF:FLDDELETED custom field, where present) are excluded; the response's excludedDeleted count says how many were left out.",
    {
      fromDate: z.string().describe("Start date, inclusive, as YYYY-MM-DD or YYYYMMDD."),
      toDate: z.string().describe("End date, inclusive, as YYYY-MM-DD or YYYYMMDD."),
      voucherType: z.string().optional().describe('Restrict to a single voucher type, e.g. "Sales" or "Payment".'),
    },
    async ({ fromDate, toDate, voucherType }) => {
      try {
        const from = toTallyDate(fromDate);
        const to = toTallyDate(toDate);
        const filters = voucherType ? [`$VoucherTypeName = "${voucherType.replace(/"/g, '\\"')}"`] : [];
        const collection = await client().fetchCollection("Voucher", VOUCHER_FIELDS, {
          filters,
          staticVars: { SVFROMDATE: from, SVTODATE: to },
        });
        const allVouchers = asArray(collection.VOUCHER);
        // The native ISDELETED tag stays "No" even for deleted vouchers on
        // some Tally setups; UDF:FLDDELETED (a custom field some companies
        // track) is the reliable signal, when present.
        const isFldDeleted = (v: any) =>
          unwrapValue(v?.["UDF:FLDDELETED.LIST"]?.["UDF:FLDDELETED"]) === "Yes";
        const excludedDeleted = allVouchers.filter(isFldDeleted).length;
        const vouchers = allVouchers
          .filter((v: any) => !isFldDeleted(v))
          .map((v: any) => ({
            date: unwrapValue(v.DATE),
            voucherType: unwrapValue(v.VOUCHERTYPENAME),
            voucherNumber: unwrapValue(v.VOUCHERNUMBER),
            partyLedger: unwrapValue(v.PARTYLEDGERNAME),
            narration: unwrapValue(v.NARRATION),
            amount: unwrapValue(v.AMOUNT),
          }));
        return toJsonContent({ count: vouchers.length, excludedDeleted, vouchers });
      } catch (err) {
        return toTextError(err);
      }
    }
  );

  server.tool(
    "create_voucher",
    "Create a new accounting voucher (e.g. Payment, Receipt, Journal, Contra, Sales, Purchase) in the active Tally company. " +
      "Provide the full set of ledger entries; debits and credits must balance.",
    {
      voucherType: z.string().describe('Tally voucher type name, e.g. "Payment", "Receipt", "Journal", "Contra", "Sales", "Purchase".'),
      date: z.string().describe("Voucher date as YYYY-MM-DD or YYYYMMDD."),
      narration: z.string().optional().describe("Optional narration/description for the voucher."),
      voucherNumber: z.string().optional().describe("Optional voucher number; Tally auto-numbers if omitted."),
      partyLedgerName: z.string().optional().describe("Optional party ledger name, relevant for Sales/Purchase vouchers."),
      entries: z
        .array(
          z.object({
            ledgerName: z.string().describe("Exact name of the ledger account for this entry."),
            amount: z.number().positive().describe("Entry amount (always positive; direction set by isDebit)."),
            isDebit: z.boolean().describe("True if this entry debits the ledger, false if it credits it."),
          })
        )
        .min(2)
        .describe("Ledger entries for the voucher. Sum of debit amounts must equal sum of credit amounts."),
    },
    async ({ voucherType, date, narration, voucherNumber, partyLedgerName, entries }) => {
      try {
        const debitTotal = entries.filter((e) => e.isDebit).reduce((s, e) => s + e.amount, 0);
        const creditTotal = entries.filter((e) => !e.isDebit).reduce((s, e) => s + e.amount, 0);
        if (Math.abs(debitTotal - creditTotal) > 0.01) {
          return toJsonContent({
            created: false,
            error: `Voucher does not balance: debits=${debitTotal}, credits=${creditTotal}.`,
          });
        }

        const tallyDate = toTallyDate(date);
        const ledgerEntriesXml = entries
          .map(
            (e) => `<ALLLEDGERENTRIES.LIST>
  <LEDGERNAME>${xmlEscape(e.ledgerName)}</LEDGERNAME>
  <ISDEEMEDPOSITIVE>${e.isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
  <AMOUNT>${e.isDebit ? -e.amount : e.amount}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`
          )
          .join("\n");

        const tallyMessage = `<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <VOUCHER VCHTYPE="${xmlEscape(voucherType)}" ACTION="Create">
    <DATE>${tallyDate}</DATE>
    <VOUCHERTYPENAME>${xmlEscape(voucherType)}</VOUCHERTYPENAME>
    ${voucherNumber ? `<VOUCHERNUMBER>${xmlEscape(voucherNumber)}</VOUCHERNUMBER>` : ""}
    ${partyLedgerName ? `<PARTYLEDGERNAME>${xmlEscape(partyLedgerName)}</PARTYLEDGERNAME>` : ""}
    ${narration ? `<NARRATION>${xmlEscape(narration)}</NARRATION>` : ""}
    ${ledgerEntriesXml}
  </VOUCHER>
</TALLYMESSAGE>`;

        const result = await client().importData("Vouchers", tallyMessage);
        return toJsonContent({ created: (result.created ?? 0) > 0, voucherType, date: tallyDate, raw: result.raw });
      } catch (err) {
        return toTextError(err);
      }
    }
  );
}
