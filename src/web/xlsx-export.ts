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
