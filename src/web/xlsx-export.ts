import ExcelJS from "exceljs";
import { unwrapValue } from "../format.js";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

function addTitleRows(sheet: ExcelJS.Worksheet, titleLines: string[], columnCount: number) {
  for (const line of titleLines) {
    const row = sheet.addRow([line]);
    row.font = { bold: true, size: 13, color: { argb: "FF1F4E78" } };
    sheet.mergeCells(row.number, 1, row.number, Math.max(columnCount, 1));
  }
  if (titleLines.length) sheet.addRow([]);
}

/** Builds a workbook with one flat table of voucher rows (Day Book / Sales / Purchase Register). */
export function buildVoucherWorkbook(
  vouchers: Array<{ date?: string; voucherType?: string; voucherNumber?: string; partyLedger?: string; narration?: string; amount?: number }>,
  sheetTitle: string,
  titleLines: string[]
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetTitle.slice(0, 31) || "Report");
  const columns = ["Date", "Voucher Type", "Voucher Number", "Party Ledger", "Narration", "Amount"];

  addTitleRows(sheet, titleLines, columns.length);
  const headerRow = sheet.addRow(columns);
  styleHeaderRow(headerRow);

  for (const v of vouchers) {
    sheet.addRow([v.date ?? "", v.voucherType ?? "", v.voucherNumber ?? "", v.partyLedger ?? "", v.narration ?? "", v.amount ?? 0]);
  }

  const lastRow = sheet.rowCount;
  const firstDataRow = headerRow.number + 1;
  if (lastRow >= firstDataRow) {
    const totalRow = sheet.addRow(["", "", "", "", "Total", { formula: `SUM(F${firstDataRow}:F${lastRow})` }]);
    totalRow.font = { bold: true };
  }

  sheet.columns = [{ width: 12 }, { width: 20 }, { width: 18 }, { width: 32 }, { width: 50 }, { width: 16, style: { numFmt: "#,##0.00" } }];
  sheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: columns.length } };
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  return wb;
}

/** Builds a workbook with one flat table of ledger accounts (All Ledger Accounts). */
export function buildLedgerWorkbook(
  ledgers: Array<{ name?: string; parent?: string; openingBalance?: number; closingBalance?: number; gstin?: string; mailingName?: string }>,
  sheetTitle: string,
  titleLines: string[]
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetTitle.slice(0, 31) || "Report");
  const columns = ["Name", "Parent Group", "Opening Balance", "Closing Balance", "GSTIN", "Mailing Name"];

  addTitleRows(sheet, titleLines, columns.length);
  const headerRow = sheet.addRow(columns);
  styleHeaderRow(headerRow);

  for (const l of ledgers) {
    sheet.addRow([l.name ?? "", l.parent ?? "", l.openingBalance ?? 0, l.closingBalance ?? 0, l.gstin ?? "", l.mailingName ?? ""]);
  }

  const lastRow = sheet.rowCount;
  const firstDataRow = headerRow.number + 1;
  if (lastRow >= firstDataRow) {
    const totalRow = sheet.addRow([
      "Total",
      "",
      { formula: `SUM(C${firstDataRow}:C${lastRow})` },
      { formula: `SUM(D${firstDataRow}:D${lastRow})` },
      "",
      "",
    ]);
    totalRow.font = { bold: true };
  }

  sheet.columns = [
    { width: 34 },
    { width: 28 },
    { width: 18, style: { numFmt: "#,##0.00" } },
    { width: 18, style: { numFmt: "#,##0.00" } },
    { width: 18 },
    { width: 34 },
  ];
  sheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: columns.length } };
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  return wb;
}

/** Builds a workbook with one flat table of ledger groups (All Group Ledgers). */
export function buildGroupWorkbook(
  groups: Array<{ name?: string; parent?: string; openingBalance?: number; closingBalance?: number }>,
  sheetTitle: string,
  titleLines: string[]
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetTitle.slice(0, 31) || "Report");
  const columns = ["Name", "Parent Group", "Opening Balance", "Closing Balance"];

  addTitleRows(sheet, titleLines, columns.length);
  const headerRow = sheet.addRow(columns);
  styleHeaderRow(headerRow);

  for (const g of groups) {
    sheet.addRow([g.name ?? "", g.parent ?? "", g.openingBalance ?? 0, g.closingBalance ?? 0]);
  }

  const lastRow = sheet.rowCount;
  const firstDataRow = headerRow.number + 1;
  if (lastRow >= firstDataRow) {
    const totalRow = sheet.addRow([
      "Total",
      "",
      { formula: `SUM(C${firstDataRow}:C${lastRow})` },
      { formula: `SUM(D${firstDataRow}:D${lastRow})` },
    ]);
    totalRow.font = { bold: true };
  }

  sheet.columns = [
    { width: 34 },
    { width: 28 },
    { width: 18, style: { numFmt: "#,##0.00" } },
    { width: 18, style: { numFmt: "#,##0.00" } },
  ];
  sheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: columns.length } };
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  return wb;
}

export interface LedgerEntryRow {
  ledgerName: string;
  date: string;
  voucherType: string;
  voucherNumber: string;
  partyLedger: string;
  isDebit: boolean;
  amount: number;
  narration: string;
  /** Bill-wise allocations on this ledger entry, e.g. "Inv-002 (New Ref): 11800.00". */
  billDetails?: string;
  /** Mode-of-payment/receipt bank details on this ledger entry, e.g. cheque/instrument number, date, bank name, transaction type. */
  bankDetails?: string;
}

export interface InventoryEntryRow {
  date: string;
  voucherType: string;
  voucherNumber: string;
  partyLedger: string;
  stockItemName: string;
  actualQty: string;
  billedQty: string;
  rate: string;
  amount: number;
}

/**
 * Builds a workbook with the full ledger-wise transaction detail: one row
 * per ledger posting (not per voucher), across every voucher in the date
 * range, grouped by ledger account, including bill-wise and mode-of-payment
 * details where present. A second sheet summarizes each ledger's entry
 * count and debit/credit totals, and a third sheet lists inventory
 * (stock item) lines when any vouchers carry them.
 */
export function buildLedgerEntriesWorkbook(
  entries: LedgerEntryRow[],
  sheetTitle: string,
  titleLines: string[],
  inventoryEntries: InventoryEntryRow[] = []
): ExcelJS.Workbook {
  const sorted = [...entries].sort((a, b) => {
    if (a.ledgerName !== b.ledgerName) return a.ledgerName.localeCompare(b.ledgerName);
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.voucherNumber.localeCompare(b.voucherNumber);
  });

  const wb = new ExcelJS.Workbook();

  // ---------------- Sheet 1: Ledger Entries (detail) ----------------
  const detail = wb.addWorksheet((sheetTitle || "Ledger Entries").slice(0, 31));
  const columns = ["Ledger Name", "Date", "Voucher Type", "Voucher Number", "Party Ledger", "Dr/Cr", "Amount", "Narration", "Bill Details", "Bank / Payment Details"];

  addTitleRows(detail, titleLines, columns.length);
  const headerRow = detail.addRow(columns);
  styleHeaderRow(headerRow);

  for (const e of sorted) {
    detail.addRow([
      e.ledgerName,
      e.date,
      e.voucherType,
      e.voucherNumber,
      e.partyLedger,
      e.isDebit ? "Dr" : "Cr",
      e.amount,
      e.narration,
      e.billDetails ?? "",
      e.bankDetails ?? "",
    ]);
  }

  const lastRow = detail.rowCount;
  const firstDataRow = headerRow.number + 1;
  if (lastRow >= firstDataRow) {
    const chkRow = detail.addRow(["", "", "", "", "Total Debit:", "", { formula: `SUMIF(F${firstDataRow}:F${lastRow},"Dr",G${firstDataRow}:G${lastRow})` }, "", "", ""]);
    chkRow.font = { bold: true };
    const chkRow2 = detail.addRow(["", "", "", "", "Total Credit:", "", { formula: `SUMIF(F${firstDataRow}:F${lastRow},"Cr",G${firstDataRow}:G${lastRow})` }, "", "", ""]);
    chkRow2.font = { bold: true };
    const chkRow3 = detail.addRow(["", "", "", "", "Difference:", "", { formula: `G${chkRow.number}-G${chkRow2.number}` }, "", "", ""]);
    chkRow3.font = { bold: true };
  }

  detail.columns = [
    { width: 32 },
    { width: 12 },
    { width: 20 },
    { width: 18 },
    { width: 32 },
    { width: 8 },
    { width: 16, style: { numFmt: "#,##0.00" } },
    { width: 50 },
    { width: 36 },
    { width: 44 },
  ];
  detail.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: columns.length } };
  detail.views = [{ state: "frozen", ySplit: headerRow.number }];

  // ---------------- Sheet 2: By Ledger Summary ----------------
  const summarySheet = wb.addWorksheet("By Ledger Summary");
  const summaryColumns = ["Ledger Name", "Entry Count", "Total Debit", "Total Credit", "Net Movement (Dr - Cr)"];
  const summaryHeaderRow = summarySheet.addRow(summaryColumns);
  styleHeaderRow(summaryHeaderRow);

  const byLedger = new Map<string, { count: number; debit: number; credit: number }>();
  for (const e of sorted) {
    const agg = byLedger.get(e.ledgerName) ?? { count: 0, debit: 0, credit: 0 };
    agg.count += 1;
    if (e.isDebit) agg.debit += e.amount;
    else agg.credit += e.amount;
    byLedger.set(e.ledgerName, agg);
  }

  let r = summaryHeaderRow.number + 1;
  for (const [ledgerName, agg] of [...byLedger.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    summarySheet.addRow([ledgerName, agg.count, agg.debit, agg.credit, agg.debit - agg.credit]);
    r++;
  }
  const summaryLastRow = r - 1;
  if (summaryLastRow >= summaryHeaderRow.number + 1) {
    const totalRow = summarySheet.addRow([
      "Total",
      { formula: `SUM(B${summaryHeaderRow.number + 1}:B${summaryLastRow})` },
      { formula: `SUM(C${summaryHeaderRow.number + 1}:C${summaryLastRow})` },
      { formula: `SUM(D${summaryHeaderRow.number + 1}:D${summaryLastRow})` },
      { formula: `SUM(E${summaryHeaderRow.number + 1}:E${summaryLastRow})` },
    ]);
    totalRow.font = { bold: true };
  }

  summarySheet.columns = [
    { width: 34 },
    { width: 14 },
    { width: 18, style: { numFmt: "#,##0.00" } },
    { width: 18, style: { numFmt: "#,##0.00" } },
    { width: 22, style: { numFmt: "#,##0.00" } },
  ];
  summarySheet.autoFilter = { from: { row: summaryHeaderRow.number, column: 1 }, to: { row: summaryHeaderRow.number, column: summaryColumns.length } };
  summarySheet.views = [{ state: "frozen", ySplit: summaryHeaderRow.number }];

  // ---------------- Sheet 3: Inventory Details (only when present) ----------------
  if (inventoryEntries.length > 0) {
    const invSheet = wb.addWorksheet("Inventory Details");
    const invColumns = ["Date", "Voucher Type", "Voucher Number", "Party Ledger", "Stock Item", "Actual Qty", "Billed Qty", "Rate", "Amount"];
    const invHeaderRow = invSheet.addRow(invColumns);
    styleHeaderRow(invHeaderRow);

    const sortedInv = [...inventoryEntries].sort((a, b) => a.date.localeCompare(b.date) || a.voucherNumber.localeCompare(b.voucherNumber));
    for (const inv of sortedInv) {
      invSheet.addRow([
        inv.date,
        inv.voucherType,
        inv.voucherNumber,
        inv.partyLedger,
        inv.stockItemName,
        inv.actualQty,
        inv.billedQty,
        inv.rate,
        inv.amount,
      ]);
    }

    const invLastRow = invSheet.rowCount;
    const invFirstDataRow = invHeaderRow.number + 1;
    if (invLastRow >= invFirstDataRow) {
      const totalRow = invSheet.addRow(["", "", "", "", "Total", "", "", "", { formula: `SUM(I${invFirstDataRow}:I${invLastRow})` }]);
      totalRow.font = { bold: true };
    }

    invSheet.columns = [
      { width: 12 },
      { width: 20 },
      { width: 18 },
      { width: 32 },
      { width: 36 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 16, style: { numFmt: "#,##0.00" } },
    ];
    invSheet.autoFilter = { from: { row: invHeaderRow.number, column: 1 }, to: { row: invHeaderRow.number, column: invColumns.length } };
    invSheet.views = [{ state: "frozen", ySplit: invHeaderRow.number }];
  }

  return wb;
}

/** Recursively finds the largest array of sibling objects anywhere in a parsed Tally response. */
function findMainArray(value: unknown, path = ""): { path: string; items: any[] } | null {
  let best: { path: string; items: any[] } | null = null;

  function visit(node: unknown, currentPath: string) {
    if (Array.isArray(node)) {
      const objectItems = node.filter((i) => i !== null && typeof i === "object" && !Array.isArray(i));
      if (objectItems.length > 1 && (!best || objectItems.length > best.items.length)) {
        best = { path: currentPath, items: objectItems };
      }
      for (const item of node) visit(item, currentPath);
    } else if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        visit(child, currentPath ? `${currentPath}.${key}` : key);
      }
    }
  }

  visit(value, path);
  return best;
}

/** Flattens one object's leaf fields into a single-level row keyed by dotted path. */
function flattenRow(obj: unknown, prefix = "", out: Record<string, string | number> = {}): Record<string, string | number> {
  const unwrapped = unwrapValue(obj);
  if (unwrapped !== null && typeof unwrapped === "object" && !Array.isArray(unwrapped)) {
    for (const [key, value] of Object.entries(unwrapped as Record<string, unknown>)) {
      if (key.startsWith("@_")) continue;
      flattenRow(value, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  if (Array.isArray(unwrapped)) {
    out[prefix || "value"] = unwrapped.map((v) => unwrapValue(v)).join("; ");
    return out;
  }
  if (typeof unwrapped === "number" || typeof unwrapped === "string") {
    out[prefix || "value"] = unwrapped;
  } else if (typeof unwrapped === "boolean") {
    out[prefix || "value"] = String(unwrapped);
  }
  return out;
}

/**
 * Builds a best-effort tabular workbook for a raw Tally report export, since
 * standard report layouts (Balance Sheet, P&L, Cash Flow, ...) don't share a
 * common schema. It auto-detects the largest repeating structure in the
 * response and flattens it into a "Data" sheet, and always includes a
 * "Raw JSON" sheet with the complete response so nothing is lost.
 */
export function buildGenericReportWorkbook(reportData: unknown, sheetTitle: string, titleLines: string[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const main = findMainArray(reportData);

  const dataSheet = wb.addWorksheet((sheetTitle || "Data").slice(0, 31));
  if (main && main.items.length > 0) {
    const rows = main.items.map((item) => flattenRow(item));
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));

    addTitleRows(dataSheet, titleLines, columns.length);
    const headerRow = dataSheet.addRow(columns);
    styleHeaderRow(headerRow);
    for (const row of rows) {
      dataSheet.addRow(columns.map((c) => row[c] ?? ""));
    }
    dataSheet.columns = columns.map((c) => ({ width: Math.min(Math.max(c.length + 2, 14), 45) }));
    dataSheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: columns.length } };
    dataSheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  } else {
    addTitleRows(dataSheet, titleLines, 2);
    dataSheet.addRow(["No tabular rows were detected in this report's response.", ""]);
    dataSheet.addRow(["See the \"Raw JSON\" sheet for the complete data Tally returned.", ""]);
  }

  const rawSheet = wb.addWorksheet("Raw JSON");
  rawSheet.getColumn(1).width = 120;
  const json = JSON.stringify(reportData, null, 2);
  for (const line of json.split("\n")) {
    rawSheet.addRow([line.slice(0, 32000)]);
  }

  return wb;
}
