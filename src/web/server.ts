#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { TallyClient } from "../tally-client.js";
import { asArray, unwrapValue } from "../format.js";
import { REPORT_CATALOG, findReport } from "./report-catalog.js";
import { buildGenericReportWorkbook, buildVoucherWorkbook } from "./xlsx-export.js";

const TALLY_URL = process.env.TALLY_URL ?? "http://localhost:9200";
const TALLY_COMPANY = process.env.TALLY_COMPANY;
const WEB_PORT = Number(process.env.WEB_PORT ?? 4000);
const WEB_HOST = process.env.WEB_HOST ?? "127.0.0.1";

const tallyClient = new TallyClient({ url: TALLY_URL, company: TALLY_COMPANY });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../../public");

const app = express();
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

app.get("/api/reports", (_req, res) => {
  res.json(REPORT_CATALOG.map(({ id, label, dateMode }) => ({ id, label, dateMode })));
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
      const isFldDeleted = (v: any) => unwrapValue(v?.["UDF:FLDDELETED.LIST"]?.["UDF:FLDDELETED"]) === "Yes";
      const vouchers = asArray(collection.VOUCHER)
        .filter((v: any) => !isFldDeleted(v))
        .map((v: any) => ({
          date: unwrapValue(v.DATE),
          voucherType: unwrapValue(v.VOUCHERTYPENAME),
          voucherNumber: unwrapValue(v.VOUCHERNUMBER),
          partyLedger: unwrapValue(v.PARTYLEDGERNAME),
          narration: unwrapValue(v.NARRATION),
          amount: Number(unwrapValue(v.AMOUNT)) || 0,
        }));
      workbook = buildVoucherWorkbook(vouchers, label, titleLines);
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
});
