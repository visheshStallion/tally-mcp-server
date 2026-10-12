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
   * "ledgerCollection" is fetched as a flat list of ledger accounts (same
   * mechanism as the list_ledgers tool).
   * "groupCollection" is fetched as a flat list of ledger groups (same
   * mechanism as the list_groups tool), with balances.
   * "ledgerVoucherDetail" fetches every voucher in the date range along with
   * its full ledger-entry breakdown (one row per ledger posting, with
   * narration, voucher type/number, and Dr/Cr amount) - a full transaction
   * history for every ledger account, not just balances.
   * "stockItemCollection" is fetched as a flat list of stock items (same
   * mechanism as the list_stock_items tool) - current stock of all items.
   * "stockItemHistory" fetches every voucher's inventory entries for one
   * named stock item (see requiresItemName) across the date range, with a
   * running quantity balance - the movement history of a single item.
   * "godownStock" aggregates every voucher's inventory entries (via their
   * godown/batch allocations) up to the date range into stock item x godown
   * quantity/value totals - a godown-wise stock position.
   * "itemLastPrices" scans Sales/Purchase vouchers in the date range for the
   * most recent rate charged/paid per stock item.
   * "namedReport" reports are fetched via Tally's "Export Data" request for
   * a built-in report name; their shape varies by report, so the exporter
   * flattens the largest repeating structure it finds into a table.
   * "custom" lets the user type any other Tally report name.
   */
  kind:
    | "voucherCollection"
    | "ledgerCollection"
    | "groupCollection"
    | "ledgerVoucherDetail"
    | "stockItemCollection"
    | "stockItemHistory"
    | "godownStock"
    | "itemLastPrices"
    | "namedReport"
    | "custom";
  reportName?: string;
  voucherTypeFilter?: string;
  /** When true, the UI shows a free-text "Stock Item Name" field and the export requires it (?itemName=). */
  requiresItemName?: boolean;
}

export const REPORT_CATALOG: ReportCatalogEntry[] = [
  { id: "balance_sheet", label: "Balance Sheet", dateMode: "asOf", kind: "namedReport", reportName: "Balance Sheet" },
  { id: "profit_and_loss", label: "Profit and Loss", dateMode: "range", kind: "namedReport", reportName: "Profit and Loss" },
  { id: "trial_balance", label: "Trial Balance", dateMode: "asOf", kind: "namedReport", reportName: "Trial Balance" },
  { id: "cash_flow", label: "Cash Flow", dateMode: "range", kind: "namedReport", reportName: "Cash Flow" },
  { id: "funds_flow", label: "Funds Flow", dateMode: "range", kind: "namedReport", reportName: "Funds Flow" },
  { id: "ratio_analysis", label: "Ratio Analysis", dateMode: "range", kind: "namedReport", reportName: "Ratio Analysis" },
  { id: "all_ledgers", label: "All Ledger Accounts", dateMode: "asOf", kind: "ledgerCollection" },
  { id: "all_ledgers_detail", label: "All Ledger Accounts (full voucher detail)", dateMode: "range", kind: "ledgerVoucherDetail" },
  { id: "all_groups", label: "All Group Ledgers", dateMode: "asOf", kind: "groupCollection" },
  { id: "day_book", label: "Day Book", dateMode: "range", kind: "voucherCollection" },
  { id: "sales_register", label: "Sales Register", dateMode: "range", kind: "voucherCollection", voucherTypeFilter: "Sales" },
  { id: "sales_register_detail", label: "Sales Register (full ledger detail)", dateMode: "range", kind: "ledgerVoucherDetail", voucherTypeFilter: "Sales" },
  { id: "purchase_register", label: "Purchase Register", dateMode: "range", kind: "voucherCollection", voucherTypeFilter: "Purchase" },
  { id: "purchase_register_detail", label: "Purchase Register (full ledger detail)", dateMode: "range", kind: "ledgerVoucherDetail", voucherTypeFilter: "Purchase" },
  { id: "receivables", label: "Outstanding Receivables (Bills Receivable)", dateMode: "asOf", kind: "namedReport", reportName: "Bills Receivable" },
  { id: "payables", label: "Outstanding Payables (Bills Payable)", dateMode: "asOf", kind: "namedReport", reportName: "Bills Payable" },
  { id: "stock_summary", label: "Stock Summary", dateMode: "asOf", kind: "namedReport", reportName: "Stock Summary" },
  { id: "all_stock_items", label: "Current Stock of All Items", dateMode: "asOf", kind: "stockItemCollection" },
  { id: "stock_item_history", label: "Stock Item History (single item)", dateMode: "range", kind: "stockItemHistory", requiresItemName: true },
  { id: "godown_wise_stock", label: "Godown-wise Stock", dateMode: "range", kind: "godownStock" },
  { id: "item_last_prices", label: "Item's Last Purchase & Sale Price", dateMode: "range", kind: "itemLastPrices" },
  { id: "reorder_status", label: "Items to Reorder (Reorder Status)", dateMode: "asOf", kind: "namedReport", reportName: "Reorder Status" },
  { id: "movement_analysis", label: "Movement Analysis", dateMode: "range", kind: "namedReport", reportName: "Movement Analysis" },
  { id: "custom_report", label: "Custom / other report...", dateMode: "range", kind: "custom" },
];

export function findReport(id: string): ReportCatalogEntry | undefined {
  return REPORT_CATALOG.find((r) => r.id === id);
}
