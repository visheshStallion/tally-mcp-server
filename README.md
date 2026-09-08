# Tally MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
[Tally](https://tallysolutions.com) (TallyPrime / Tally.ERP 9) accounting data
and operations as tools for LLM clients such as Claude Desktop, Claude Code,
or any other MCP-compatible client.

It talks to Tally over its built-in HTTP/XML gateway — the same interface used
by ODBC connectors and third-party integrations — so no plugin needs to be
installed inside Tally itself.

## Prerequisites

1. **Tally** (TallyPrime or Tally.ERP 9) running locally or on a reachable host.
2. The Tally XML/HTTP gateway enabled:
   - In Tally, go to **Gateway of Tally > F1 (Help) > Settings > Connectivity**.
   - Ensure **"Client/Server configuration"** is set up and the port (default
     `9000`) is open. Tally must have a company loaded for most tools to
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
| `TALLY_URL`     | `http://localhost:9000` | Base URL of the Tally HTTP/XML gateway.           |
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
        "TALLY_URL": "http://localhost:9000",
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
| `get_day_book`        | Fetch the Day Book over a date range.                                    |

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
