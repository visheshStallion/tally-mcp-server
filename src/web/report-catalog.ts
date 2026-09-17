export type DateMode = "range" | "asOf";

export interface ReportCatalogEntry {
  /** Stable id used in the UI and the export API (?report=<id>). */
  id: string;
  /** Human-readable label shown in the report picker. */
  label: string;
  /** Whether the report takes a from/to date range or a single as-of date. */
  dateMode: DateMode;
  /**
   * "voucherCollection" reports are fetched as a flat list of vouchers (same
   * mechanism as the list_vouchers tool), optionally filtered to one voucher
   * type - this gives reliable tabular data for register-style reports.
   * "namedReport" reports are fetched via Tally's "Export Data" request for
   * a built-in report name; their shape varies by report, so the exporter
   * flattens the largest repeating structure it finds into a table.
   * "custom" lets the user type any other Tally report name.
   */
  kind: "voucherCollection" | "namedReport" | "custom";
  reportName?: string;
  voucherTypeFilter?: string;
}

export const REPORT_CATALOG: ReportCatalogEntry[] = [
  { id: "balance_sheet", label: "Balance Sheet", dateMode: "asOf", kind: "namedReport", reportName: "Balance Sheet" },
  { id: "profit_and_loss", label: "Profit and Loss", dateMode: "range", kind: "namedReport", reportName: "Profit and Loss" },
  { id: "trial_balance", label: "Trial Balance", dateMode: "asOf", kind: "namedReport", reportName: "Trial Balance" },
  { id: "cash_flow", label: "Cash Flow", dateMode: "range", kind: "namedReport", reportName: "Cash Flow" },
  { id: "funds_flow", label: "Funds Flow", dateMode: "range", kind: "namedReport", reportName: "Funds Flow" },
  { id: "ratio_analysis", label: "Ratio Analysis", dateMode: "range", kind: "namedReport", reportName: "Ratio Analysis" },
  { id: "day_book", label: "Day Book", dateMode: "range", kind: "voucherCollection" },
  { id: "sales_register", label: "Sales Register", dateMode: "range", kind: "voucherCollection", voucherTypeFilter: "Sales" },
  { id: "purchase_register", label: "Purchase Register", dateMode: "range", kind: "voucherCollection", voucherTypeFilter: "Purchase" },
  { id: "receivables", label: "Outstanding Receivables (Bills Receivable)", dateMode: "asOf", kind: "namedReport", reportName: "Bills Receivable" },
  { id: "payables", label: "Outstanding Payables (Bills Payable)", dateMode: "asOf", kind: "namedReport", reportName: "Bills Payable" },
  { id: "stock_summary", label: "Stock Summary", dateMode: "asOf", kind: "namedReport", reportName: "Stock Summary" },
  { id: "movement_analysis", label: "Movement Analysis", dateMode: "range", kind: "namedReport", reportName: "Movement Analysis" },
  { id: "custom_report", label: "Custom / other report...", dateMode: "range", kind: "custom" },
];

export function findReport(id: string): ReportCatalogEntry | undefined {
  return REPORT_CATALOG.find((r) => r.id === id);
}
