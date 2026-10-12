#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { TallyClient } from "../tally-client.js";
import { asArray, unwrapValue } from "../format.js";
import { REPORT_CATALOG, findReport } from "./report-catalog.js";
import {
  buildGenericReportWorkbook,
  buildGodownStockWorkbook,
  buildGroupWorkbook,
  buildItemLastPricesWorkbook,
  buildLedgerEntriesWorkbook,
  buildLedgerWorkbook,
  buildStockItemHistoryWorkbook,
  buildStockItemWorkbook,
  buildVoucherWorkbook,
  type GodownStockRow,
  type InventoryEntryRow,
  type ItemLastPriceRow,
  type LedgerEntryRow,
  type StockItemHistoryRow,
} from "./xlsx-export.js";

const LEDGER_FIELDS = ["NAME", "PARENT", "OPENINGBALANCE", "CLOSINGBALANCE", "GSTIN", "MAILINGNAME"];
const GROUP_FIELDS = ["NAME", "PARENT", "OPENINGBALANCE", "CLOSINGBALANCE"];
const STOCK_ITEM_FIELDS = ["NAME", "PARENT", "BASEUNITS", "CLOSINGBALANCE", "CLOSINGRATE", "CLOSINGVALUE"];
const VOUCHER_DETAIL_FIELDS = [
  "DATE",
  "VOUCHERTYPENAME",
  "VOUCHERNUMBER",
  "PARTYLEDGERNAME",
  "NARRATION",
  "ALLLEDGERENTRIES.LIST",
  "ALLINVENTORYENTRIES.LIST",
];

/** Extracts the leading signed numeric value from a Tally quantity/rate string, e.g. "10 Nos" -> 10, "-5 Nos" -> -5. */
function parseLeadingNumber(s: string): number {
  const m = s.trim().match(/^-?[\d,]+(\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, "")) : 0;
}

/** Formats a ledger entry's bill-wise allocations (BILLALLOCATIONS.LIST), e.g. "Inv-002 (New Ref): 11800.00". */
function formatBillDetails(ledgerEntry: any): string {
  return asArray(ledgerEntry?.["BILLALLOCATIONS.LIST"])
    .map((b: any) => {
      const name = unwrapValue(b.NAME) ?? "";
      const billType = unwrapValue(b.BILLTYPE) ?? "";
      const amount = unwrapValue(b.AMOUNT) ?? "";
      return billType ? `${name} (${billType}): ${amount}` : `${name}: ${amount}`;
    })
    .filter(Boolean)
    .join("; ");
}

/** Formats a ledger entry's mode-of-payment/receipt bank details (BANKALLOCATIONS.LIST). */
function formatBankDetails(ledgerEntry: any): string {
  return asArray(ledgerEntry?.["BANKALLOCATIONS.LIST"])
    .map((b: any) => {
      const parts: string[] = [];
      const transactionType = unwrapValue(b.TRANSACTIONTYPE);
      const instrumentNumber = unwrapValue(b.INSTRUMENTNUMBER);
      const instrumentDate = unwrapValue(b.INSTRUMENTDATE);
      const bankName = unwrapValue(b.BANKNAME) ?? unwrapValue(b.NAME);
      const favouring = unwrapValue(b.PAYMENTFAVOURING);
      const status = unwrapValue(b.STATUS) ?? unwrapValue(b.TRANSACTIONREFERENCE);
      if (transactionType) parts.push(String(transactionType));
      if (instrumentNumber) parts.push(`Instrument #${instrumentNumber}`);
      if (instrumentDate) parts.push(`Dated ${instrumentDate}`);
      if (bankName) parts.push(`Bank: ${bankName}`);
      if (favouring) parts.push(`Favouring: ${favouring}`);
      if (status) parts.push(`Status: ${status}`);
      return parts.join(", ");
    })
    .filter(Boolean)
    .join(" | ");
}

/** UDF:FLDDELETED is the reliable "this voucher was deleted" signal on this Tally setup (ISDELETED stays "No" regardless). */
function isVoucherDeleted(v: any): boolean {
  return unwrapValue(v?.["UDF:FLDDELETED.LIST"]?.["UDF:FLDDELETED"]) === "Yes";
}

/**
 * Unwraps and stringifies a Tally XML field. fast-xml-parser's parseTagValue
 * option turns numeric-looking tag content (e.g. a bare <DATE>20250105</DATE>
 * with no type attribute) into a JS number, which breaks string ops like
 * .localeCompare() downstream - this normalizes every such field to a string.
 */
function str(v: unknown): string {
  const u = unwrapValue(v);
  return u === null || u === undefined ? "" : String(u);
}

const TALLY_URL = process.env.TALLY_URL ?? "http://localhost:9200";
const TALLY_COMPANY = process.env.TALLY_COMPANY;
const WEB_PORT = Number(process.env.WEB_PORT ?? 4000);
const WEB_HOST = process.env.WEB_HOST ?? "127.0.0.1";
const WEB_USERNAME = process.env.WEB_USERNAME;
const WEB_PASSWORD = process.env.WEB_PASSWORD;

if ((WEB_USERNAME && !WEB_PASSWORD) || (!WEB_USERNAME && WEB_PASSWORD)) {
  console.error("Set both WEB_USERNAME and WEB_PASSWORD, or neither - a single one is not enough to enable login.");
  process.exit(1);
}
const authEnabled = Boolean(WEB_USERNAME && WEB_PASSWORD);
const isLocalHost = WEB_HOST === "127.0.0.1" || WEB_HOST === "localhost" || WEB_HOST === "::1";

const tallyClient = new TallyClient({ url: TALLY_URL, company: TALLY_COMPANY });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../../public");

const app = express();

/** Constant-time HTTP Basic Auth check, only active when WEB_USERNAME/WEB_PASSWORD are both set. */
function checkAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!authEnabled) return next();

  const header = req.headers.authorization;
  if (header?.startsWith("Basic ")) {
    const [user, pass] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
    const userOk = user?.length === WEB_USERNAME!.length && crypto.timingSafeEqual(Buffer.from(user), Buffer.from(WEB_USERNAME!));
    const passOk = pass?.length === WEB_PASSWORD!.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(WEB_PASSWORD!));
    if (userOk && passOk) return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="Tally Reports"');
  res.status(401).send("Authentication required.");
}

app.use(checkAuth);
app.use(express.static(publicDir));

/** Normalizes a UI date (YYYY-MM-DD, from an <input type="date">) into Tally's YYYYMMDD format. */
function toTallyDate(input: unknown): string | undefined {
  if (!input) return undefined;
  const digits = String(input).replace(/-/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`Invalid date "${input}". Use YYYY-MM-DD.`);
  }
  return digits;
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "report";
}

app.get("/api/company", async (_req, res) => {
  try {
    const companies = await tallyClient.listCompanies();
    const active = TALLY_COMPANY ?? (companies.length === 1 ? companies[0] : null);
    res.json({ companies, active });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

app.get("/api/reports", (_req, res) => {
  res.json(REPORT_CATALOG.map(({ id, label, dateMode, requiresItemName }) => ({ id, label, dateMode, requiresItemName: Boolean(requiresItemName) })));
});

app.get("/api/export", async (req, res) => {
  try {
    const reportId = String(req.query.report ?? "");
    const entry = findReport(reportId);
    if (!entry) {
      res.status(400).json({ error: `Unknown report "${reportId}".` });
      return;
    }

    const fromDate = toTallyDate(req.query.fromDate);
    const toDate = toTallyDate(req.query.toDate);
    const customReportName = req.query.customReportName ? String(req.query.customReportName) : undefined;
    const itemName = req.query.itemName ? String(req.query.itemName).trim() : undefined;

    if (entry.requiresItemName && !itemName) {
      res.status(400).json({ error: `"${entry.label}" requires a stock item name.` });
      return;
    }

    const titleLines: string[] = [];
    if (TALLY_COMPANY) titleLines.push(`Company: ${TALLY_COMPANY}`);
    if (entry.dateMode === "range") {
      titleLines.push(`Period: ${req.query.fromDate || "(earliest)"} to ${req.query.toDate || "(latest)"}`);
    } else if (req.query.toDate) {
      titleLines.push(`As of: ${req.query.toDate}`);
    }

    let workbook;
    let label = entry.label;

    if (entry.kind === "voucherCollection") {
      if (!fromDate || !toDate) {
        res.status(400).json({ error: `"${entry.label}" requires both a from date and a to date.` });
        return;
      }
      const fields = ["DATE", "VOUCHERTYPENAME", "VOUCHERNUMBER", "PARTYLEDGERNAME", "NARRATION", "AMOUNT"];
      const filters = entry.voucherTypeFilter ? [`$VoucherTypeName = "${entry.voucherTypeFilter}"`] : [];
      const collection = await tallyClient.fetchCollection("Voucher", fields, {
        filters,
        staticVars: { SVFROMDATE: fromDate, SVTODATE: toDate },
      });
      const vouchers = asArray(collection.VOUCHER)
        .filter((v: any) => !isVoucherDeleted(v))
        .map((v: any) => ({
          date: str(v.DATE),
          voucherType: str(v.VOUCHERTYPENAME),
          voucherNumber: str(v.VOUCHERNUMBER),
          partyLedger: str(v.PARTYLEDGERNAME),
          narration: str(v.NARRATION),
          amount: Number(unwrapValue(v.AMOUNT)) || 0,
        }));
      workbook = buildVoucherWorkbook(vouchers, label, titleLines);
    } else if (entry.kind === "ledgerVoucherDetail") {
      if (!fromDate || !toDate) {
        res.status(400).json({ error: `"${entry.label}" requires both a from date and a to date.` });
        return;
      }
      const filters = entry.voucherTypeFilter ? [`$VoucherTypeName = "${entry.voucherTypeFilter}"`] : [];
      const collection = await tallyClient.fetchCollection("Voucher", VOUCHER_DETAIL_FIELDS, {
        filters,
        staticVars: { SVFROMDATE: fromDate, SVTODATE: toDate },
      });
      const entries: LedgerEntryRow[] = [];
      const inventoryEntries: InventoryEntryRow[] = [];
      for (const v of asArray(collection.VOUCHER)) {
        if (isVoucherDeleted(v)) continue;
        const date = str(v.DATE);
        const voucherType = str(v.VOUCHERTYPENAME);
        const voucherNumber = str(v.VOUCHERNUMBER);
        const partyLedger = str(v.PARTYLEDGERNAME);
        const narration = str(v.NARRATION);
        for (const le of asArray(v["ALLLEDGERENTRIES.LIST"])) {
          entries.push({
            ledgerName: str(le.LEDGERNAME),
            date,
            voucherType,
            voucherNumber,
            partyLedger,
            isDebit: unwrapValue(le.ISDEEMEDPOSITIVE) === "Yes",
            amount: Math.abs(Number(unwrapValue(le.AMOUNT)) || 0),
            narration,
            billDetails: formatBillDetails(le) || undefined,
            bankDetails: formatBankDetails(le) || undefined,
          });
        }
        for (const inv of asArray(v["ALLINVENTORYENTRIES.LIST"])) {
          inventoryEntries.push({
            date,
            voucherType,
            voucherNumber,
            partyLedger,
            stockItemName: str(inv.STOCKITEMNAME),
            actualQty: str(inv.ACTUALQTY),
            billedQty: str(inv.BILLEDQTY),
            rate: str(inv.RATE),
            amount: Number(unwrapValue(inv.AMOUNT)) || 0,
          });
        }
      }
      workbook = buildLedgerEntriesWorkbook(entries, label, titleLines, inventoryEntries);
    } else if (entry.kind === "ledgerCollection") {
      const collection = await tallyClient.fetchCollection("Ledger", LEDGER_FIELDS, {
        staticVars: toDate ? { SVTODATE: toDate } : {},
      });
      const ledgers = asArray(collection.LEDGER).map((l: any) => ({
        name: unwrapValue(l.NAME ?? l["@_NAME"]),
        parent: unwrapValue(l.PARENT),
        openingBalance: Number(unwrapValue(l.OPENINGBALANCE)) || 0,
        closingBalance: Number(unwrapValue(l.CLOSINGBALANCE)) || 0,
        gstin: unwrapValue(l.GSTIN),
        mailingName: unwrapValue(l.MAILINGNAME),
      }));
      workbook = buildLedgerWorkbook(ledgers, label, titleLines);
    } else if (entry.kind === "groupCollection") {
      const collection = await tallyClient.fetchCollection("Group", GROUP_FIELDS, {
        staticVars: toDate ? { SVTODATE: toDate } : {},
      });
      const groups = asArray(collection.GROUP).map((g: any) => ({
        name: unwrapValue(g.NAME ?? g["@_NAME"]),
        parent: unwrapValue(g.PARENT),
        openingBalance: Number(unwrapValue(g.OPENINGBALANCE)) || 0,
        closingBalance: Number(unwrapValue(g.CLOSINGBALANCE)) || 0,
      }));
      workbook = buildGroupWorkbook(groups, label, titleLines);
    } else if (entry.kind === "stockItemCollection") {
      const collection = await tallyClient.fetchCollection("StockItem", STOCK_ITEM_FIELDS, {
        staticVars: toDate ? { SVTODATE: toDate } : {},
      });
      const items = asArray(collection.STOCKITEM).map((i: any) => ({
        name: str(i.NAME ?? i["@_NAME"]),
        parent: str(i.PARENT),
        baseUnit: str(i.BASEUNITS),
        closingBalance: str(i.CLOSINGBALANCE),
        closingRate: str(i.CLOSINGRATE),
        closingValue: Number(unwrapValue(i.CLOSINGVALUE)) || 0,
      }));
      workbook = buildStockItemWorkbook(items, label, titleLines);
    } else if (entry.kind === "stockItemHistory") {
      if (!fromDate || !toDate) {
        res.status(400).json({ error: `"${entry.label}" requires both a from date and a to date.` });
        return;
      }
      const collection = await tallyClient.fetchCollection(
        "Voucher",
        ["DATE", "VOUCHERTYPENAME", "VOUCHERNUMBER", "PARTYLEDGERNAME", "NARRATION", "ALLINVENTORYENTRIES.LIST"],
        { staticVars: { SVFROMDATE: fromDate, SVTODATE: toDate } }
      );
      const needle = itemName!.toLowerCase();
      const matches: Array<Omit<StockItemHistoryRow, "runningQty">> = [];
      for (const v of asArray(collection.VOUCHER)) {
        if (isVoucherDeleted(v)) continue;
        const date = str(v.DATE);
        const voucherType = str(v.VOUCHERTYPENAME);
        const voucherNumber = str(v.VOUCHERNUMBER);
        const partyLedger = str(v.PARTYLEDGERNAME);
        const narration = str(v.NARRATION);
        for (const inv of asArray(v["ALLINVENTORYENTRIES.LIST"])) {
          const stockItemName = str(inv.STOCKITEMNAME);
          if (!stockItemName.toLowerCase().includes(needle)) continue;
          matches.push({
            date,
            voucherType,
            voucherNumber,
            partyLedger,
            quantity: str(inv.ACTUALQTY),
            rate: str(inv.RATE),
            amount: Number(unwrapValue(inv.AMOUNT)) || 0,
            narration,
          });
        }
      }
      matches.sort((a, b) => a.date.localeCompare(b.date) || a.voucherNumber.localeCompare(b.voucherNumber));
      let runningQty = 0;
      const rows: StockItemHistoryRow[] = matches.map((m) => {
        runningQty += parseLeadingNumber(m.quantity);
        return { ...m, runningQty };
      });
      if (rows.length === 0) {
        res.status(404).json({ error: `No vouchers found for a stock item matching "${itemName}" in that date range.` });
        return;
      }
      workbook = buildStockItemHistoryWorkbook(itemName!, rows, titleLines);
    } else if (entry.kind === "godownStock") {
      if (!fromDate || !toDate) {
        res.status(400).json({ error: `"${entry.label}" requires both a from date and a to date (set From Date far enough back to capture opening stock).` });
        return;
      }
      const collection = await tallyClient.fetchCollection("Voucher", ["DATE", "ALLINVENTORYENTRIES.LIST"], {
        staticVars: { SVFROMDATE: fromDate, SVTODATE: toDate },
      });
      const byKey = new Map<string, GodownStockRow>();
      for (const v of asArray(collection.VOUCHER)) {
        if (isVoucherDeleted(v)) continue;
        for (const inv of asArray(v["ALLINVENTORYENTRIES.LIST"])) {
          const stockItemName = str(inv.STOCKITEMNAME);
          const batches = asArray(inv["BATCHALLOCATIONS.LIST"]);
          const allocations =
            batches.length > 0
              ? batches.map((b: any) => ({ godownName: str(b.GODOWNNAME) || "(no godown)", qty: parseLeadingNumber(str(b.ACTUALQTY)), value: Number(unwrapValue(b.AMOUNT)) || 0 }))
              : [{ godownName: str(inv.GODOWNNAME) || "(no godown)", qty: parseLeadingNumber(str(inv.ACTUALQTY)), value: Number(unwrapValue(inv.AMOUNT)) || 0 }];
          for (const a of allocations) {
            const key = `${stockItemName}\u0000${a.godownName}`;
            const row = byKey.get(key) ?? { stockItemName, godownName: a.godownName, quantity: 0, value: 0 };
            row.quantity += a.qty;
            row.value += a.value;
            byKey.set(key, row);
          }
        }
      }
      workbook = buildGodownStockWorkbook([...byKey.values()], titleLines);
    } else if (entry.kind === "itemLastPrices") {
      if (!fromDate || !toDate) {
        res.status(400).json({ error: `"${entry.label}" requires both a from date and a to date.` });
        return;
      }
      const collection = await tallyClient.fetchCollection(
        "Voucher",
        ["DATE", "VOUCHERTYPENAME", "VOUCHERNUMBER", "ALLINVENTORYENTRIES.LIST"],
        { staticVars: { SVFROMDATE: fromDate, SVTODATE: toDate } }
      );
      type Best = { date: string; rate: string; voucherNumber: string };
      const lastPurchase = new Map<string, Best>();
      const lastSale = new Map<string, Best>();
      for (const v of asArray(collection.VOUCHER)) {
        if (isVoucherDeleted(v)) continue;
        const voucherType = str(v.VOUCHERTYPENAME).toLowerCase();
        const date = str(v.DATE);
        const voucherNumber = str(v.VOUCHERNUMBER);
        const target = voucherType === "sales" ? lastSale : voucherType === "purchase" ? lastPurchase : null;
        if (!target) continue;
        for (const inv of asArray(v["ALLINVENTORYENTRIES.LIST"])) {
          const stockItemName = str(inv.STOCKITEMNAME);
          if (!stockItemName) continue;
          const existing = target.get(stockItemName);
          if (!existing || date.localeCompare(existing.date) > 0) {
            target.set(stockItemName, { date, rate: str(inv.RATE), voucherNumber });
          }
        }
      }
      const itemNames = new Set([...lastPurchase.keys(), ...lastSale.keys()]);
      const rows: ItemLastPriceRow[] = [...itemNames].map((name) => {
        const p = lastPurchase.get(name);
        const s = lastSale.get(name);
        return {
          stockItemName: name,
          lastPurchaseDate: p?.date ?? "",
          lastPurchaseRate: p?.rate ?? "",
          lastPurchaseVoucher: p?.voucherNumber ?? "",
          lastSaleDate: s?.date ?? "",
          lastSaleRate: s?.rate ?? "",
          lastSaleVoucher: s?.voucherNumber ?? "",
        };
      });
      workbook = buildItemLastPricesWorkbook(rows, titleLines);
    } else {
      const reportName = entry.kind === "custom" ? customReportName : entry.reportName;
      if (!reportName) {
        res.status(400).json({ error: "customReportName is required for a custom report." });
        return;
      }
      label = entry.kind === "custom" ? reportName : label;
      const staticVars: Record<string, string> = {};
      if (entry.dateMode === "range") {
        if (fromDate) staticVars.SVFROMDATE = fromDate;
        if (toDate) staticVars.SVTODATE = toDate;
      } else if (toDate) {
        staticVars.SVTODATE = toDate;
      }
      const data = await tallyClient.exportReport(reportName, staticVars);
      workbook = buildGenericReportWorkbook(data, label, titleLines);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${safeFilenamePart(label)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

app.listen(WEB_PORT, WEB_HOST, () => {
  console.error(
    `tally-mcp-server web UI running at http://${WEB_HOST}:${WEB_PORT} (Tally gateway: ${TALLY_URL}${TALLY_COMPANY ? `, company: ${TALLY_COMPANY}` : ""})`
  );
  console.error(authEnabled ? "Login required (WEB_USERNAME/WEB_PASSWORD set)." : "No login required.");
  if (!isLocalHost && !authEnabled) {
    console.error(
      "\n*** WARNING ***\n" +
        `WEB_HOST is set to "${WEB_HOST}" (not localhost) but WEB_USERNAME/WEB_PASSWORD are not set.\n` +
        "Anyone who can reach this address can view and export your Tally financial data.\n" +
        "Set WEB_USERNAME and WEB_PASSWORD before exposing this beyond your own machine.\n"
    );
  }
});
