# Tally MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
[Tally](https://tallysolutions.com) (TallyPrime / Tally.ERP 9) accounting data
and operations as tools for LLM clients such as Claude Desktop, Claude Code,
or any other MCP-compatible client.

It talks to Tally over its built-in HTTP/XML gateway — the same interface used
by ODBC connectors and third-party integrations — so no plugin needs to be
installed inside Tally itself.

## Prerequisites

1. **Tally** (TallyPrime 7.0 or later, or Tally.ERP 9) running locally or on a
   reachable host.
2. The Tally XML/HTTP gateway enabled:
   - In Tally, go to **Gateway of Tally > F1 (Help) > Settings > Connectivity**.
   - Ensure **"Client/Server configuration"** is set up and the port (default
     `9200`) is open. Tally must have a company loaded for most tools to
     return data.
3. Node.js 18+.

## Install & build

```bash
npm install
npm run build
```

## Configuration

The server reads its Tally connection settings from environment variables:

| Variable        | Default                 | Description                                      |
|-----------------|--------------------------|---------------------------------------------------|
| `TALLY_URL`     | `http://localhost:9200` | Base URL of the Tally HTTP/XML gateway.           |
| `TALLY_COMPANY` | _(active company)_      | Company name to scope requests to (optional).     |

## Running

```bash
npm start
```

This starts the server on stdio, ready to be attached to an MCP client.

### Claude Desktop / Claude Code configuration

Add to your MCP client's server config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tally": {
      "command": "node",
      "args": ["/absolute/path/to/tally-mcp-server/dist/index.js"],
      "env": {
        "TALLY_URL": "http://localhost:9200",
        "TALLY_COMPANY": "My Company Name"
      }
    }
  }
}
```

## Available tools

| Tool                  | Description                                                             |
|-----------------------|---------------------------------------------------------------------------|
| `list_companies`      | List companies currently open in Tally.                                  |
| `list_ledgers`        | List all ledger accounts with balances.                                  |
| `get_ledger`          | Get a single ledger's details/balance by name.                           |
| `list_groups`         | List ledger groups (chart-of-accounts hierarchy).                        |
| `list_stock_items`    | List inventory items with closing stock and value.                       |
| `get_stock_item`      | Get a single stock item's details by name.                               |
| `list_vouchers`       | List transaction vouchers within a date range, optionally by type.       |
| `create_voucher`      | Create a new voucher (Payment, Receipt, Journal, Sales, Purchase, ...).   |
| `get_balance_sheet`   | Fetch the Balance Sheet as of a date.                                    |
| `get_profit_and_loss` | Fetch the Profit & Loss statement over a date range.                     |
| `get_trial_balance`   | Fetch the Trial Balance as of a date.                                    |
| `get_cash_flow`       | Fetch the Cash Flow statement over a date range.                         |
| `get_funds_flow`      | Fetch the Funds Flow statement over a date range.                        |
| `get_ratio_analysis`  | Fetch the Ratio Analysis report over a date range.                       |
| `get_day_book`        | Fetch the Day Book over a date range.                                    |
| `get_sales_register`  | Fetch the Sales Register over a date range.                              |
| `get_purchase_register`| Fetch the Purchase Register over a date range.                          |
| `get_receivables`     | Fetch Outstanding Receivables (Bills Receivable) as of a date.           |
| `get_payables`        | Fetch Outstanding Payables (Bills Payable) as of a date.                 |
| `get_stock_summary`   | Fetch the Stock Summary as of a date.                                    |
| `get_movement_analysis`| Fetch the Movement Analysis report over a date range.                   |
| `get_custom_report`   | Fetch any other standard/statutory report (e.g. GSTR-1) by exact name.   |

## Web UI (Excel export)

Alongside the MCP server, the project includes a small local web page for
browsing the standard reports above and exporting one straight to Excel with
a start/end date filter - no MCP client required.

```bash
npm run web        # run directly with tsx, no build step
# or, after `npm run build`:
npm run web:start   # run the compiled server
```

This starts an HTTP server (default `http://127.0.0.1:4000`, only bound to
localhost) serving a page where you can:

1. Pick a report from the dropdown (all the report tools listed above, plus
   a "Custom / other report..." option for typing any other Tally report
   name, e.g. a GST return).
2. Set a **From date** / **To date** (or a single **As of date** for
   point-in-time reports like the Balance Sheet).
3. Click **Export to Excel** to download an `.xlsx` file fetched live from
   Tally for that date range.

Day Book, Sales Register, and Purchase Register are exported as a flat
voucher table. Statement-style reports (Balance Sheet, P&L, Cash Flow,
Ratio Analysis, etc.) don't share one common layout, so the export
auto-detects the largest repeating structure in Tally's response for the
main "Data" sheet, and always includes a "Raw JSON" sheet with the complete
response as a fallback.

Configure it with the same `TALLY_URL` / `TALLY_COMPANY` environment
variables as the MCP server, plus:

| Variable   | Default     | Description                                   |
|------------|-------------|------------------------------------------------|
| `WEB_PORT` | `4000`      | Port the web UI listens on.                    |
| `WEB_HOST` | `127.0.0.1` | Host/interface to bind to.                     |

## Development

```bash
npm run dev     # run directly with tsx, no build step
npm run watch   # incremental tsc build
```

## Notes & limitations

- Tally's XML gateway must be reachable from wherever this server runs; if
  Tally is on another machine, expose the configured port on your network and
  point `TALLY_URL` at it.
- Only one company can be actively targeted per server instance
  (`TALLY_COMPANY`); to work with another company, restart with a different
  value or omit it to use whatever company is currently open in Tally.
- `create_voucher` requires ledger entries to balance (debits == credits);
  the server checks this client-side before submitting, but Tally performs
  its own validation as well (e.g. required masters must already exist).
