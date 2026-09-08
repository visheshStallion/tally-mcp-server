import axios from "axios";
import { XMLBuilder, XMLParser } from "fast-xml-parser";

export interface TallyClientOptions {
  /** Base URL of Tally's HTTP/XML gateway, e.g. http://localhost:9000 */
  url: string;
  /** Optional company name to scope requests to (defaults to the active company in Tally). */
  company?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: true,
  isArray: (tagName) =>
    ["LEDGER", "GROUP", "STOCKITEM", "VOUCHER", "COMPANY", "COLUMN"].includes(tagName),
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: false,
});

export class TallyError extends Error {
  constructor(message: string, public readonly raw?: string) {
    super(message);
    this.name = "TallyError";
  }
}

/**
 * Thin client around Tally's HTTP-XML gateway (the same interface used by
 * Tally's ODBC/XML integration). Tally must have the gateway enabled:
 * F1 (Help) > Settings > Connectivity > Client/Server configuration,
 * with "Tally.NET" / HTTP port set (default 9000).
 */
export class TallyClient {
  private readonly url: string;
  private readonly company?: string;
  private readonly timeoutMs: number;

  constructor(opts: TallyClientOptions) {
    this.url = opts.url;
    this.company = opts.company;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private staticVariables(extra: Record<string, string> = {}): Record<string, string> {
    const vars: Record<string, string> = { SVEXPORTFORMAT: "$$SysName:XML", ...extra };
    if (this.company) vars.SVCURRENTCOMPANY = this.company;
    return vars;
  }

  /** Sends a raw XML envelope to Tally and returns the parsed response. */
  private async send(envelope: unknown): Promise<any> {
    const xml = builder.build(envelope);
    let responseText: string;
    try {
      const res = await axios.post(this.url, xml, {
        headers: { "Content-Type": "text/xml" },
        timeout: this.timeoutMs,
      });
      responseText = res.data;
    } catch (err: any) {
      const detail = err.code === "ECONNREFUSED"
        ? `Could not connect to Tally at ${this.url}. Make sure Tally is running with the HTTP gateway enabled (Gateway of Tally > F1 Help > Settings > Connectivity).`
        : err.message;
      throw new TallyError(`Request to Tally failed: ${detail}`);
    }

    if (typeof responseText !== "string" || responseText.trim().length === 0) {
      throw new TallyError("Tally returned an empty response.");
    }

    let parsed: any;
    try {
      parsed = parser.parse(responseText);
    } catch (err: any) {
      throw new TallyError(`Failed to parse Tally XML response: ${err.message}`, responseText);
    }

    const lineErrors = parsed?.ENVELOPE?.LINEERROR;
    if (lineErrors) {
      const msg = Array.isArray(lineErrors) ? lineErrors.join("; ") : String(lineErrors);
      throw new TallyError(`Tally reported an error: ${msg}`, responseText);
    }

    return parsed;
  }

  /**
   * Fetches a raw master/transaction collection (e.g. Ledger, Group, StockItem,
   * Voucher, CostCentre) using Tally's inline-TDL "Collection" export, which is
   * the standard way to pull structured master data over the XML/HTTP gateway.
   */
  async fetchCollection(
    objectType: string,
    fields: string[],
    opts: { filters?: string[]; name?: string; staticVars?: Record<string, string> } = {}
  ): Promise<any> {
    const collectionName = opts.name ?? `${objectType} List`;
    const filterXml = opts.filters?.length
      ? `<FILTER>${opts.filters.map((_, i) => `Filter${i + 1}`).join(",")}</FILTER>` +
        opts.filters.map((f, i) => `<SYSTEM TYPE="Formulae" NAME="Filter${i + 1}">${f}</SYSTEM>`).join("")
      : "";

    // fast-xml-parser's builder doesn't easily express the FILTER/SYSTEM
    // combination alongside TYPE/FETCH, so the TDL block is assembled by hand.
    const staticVarsXml = Object.entries(this.staticVariables(opts.staticVars))
      .map(([k, v]) => `<${k}>${v}</${k}>`)
      .join("");

    const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>COLLECTION</TYPE>
    <ID>${collectionName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>${staticVarsXml}</STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="${collectionName}" ISMODIFY="No">
            <TYPE>${objectType}</TYPE>
            <FETCH>${fields.join(", ")}</FETCH>
            ${filterXml}
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

    let responseText: string;
    try {
      const res = await axios.post(this.url, xml, {
        headers: { "Content-Type": "text/xml" },
        timeout: this.timeoutMs,
      });
      responseText = res.data;
    } catch (err: any) {
      const detail = err.code === "ECONNREFUSED"
        ? `Could not connect to Tally at ${this.url}. Make sure Tally is running with the HTTP gateway enabled.`
        : err.message;
      throw new TallyError(`Request to Tally failed: ${detail}`);
    }

    if (typeof responseText !== "string" || responseText.trim().length === 0) {
      throw new TallyError("Tally returned an empty response.");
    }

    let parsed: any;
    try {
      parsed = parser.parse(responseText);
    } catch (err: any) {
      throw new TallyError(`Failed to parse Tally XML response: ${err.message}`, responseText);
    }

    if (parsed?.ENVELOPE?.LINEERROR) {
      throw new TallyError(`Tally reported an error: ${parsed.ENVELOPE.LINEERROR}`, responseText);
    }

    return parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION ?? {};
  }

  /** Runs an "Export Data" request for a built-in Tally report/collection. */
  async exportReport(reportName: string, staticVars: Record<string, string> = {}): Promise<any> {
    const envelope = {
      ENVELOPE: {
        HEADER: { TALLYREQUEST: "Export Data" },
        BODY: {
          EXPORTDATA: {
            REQUESTDESC: {
              REPORTNAME: reportName,
              STATICVARIABLES: this.staticVariables(staticVars),
            },
          },
        },
      },
    };
    return this.send(envelope);
  }

  /** Sends one or more <TALLYMESSAGE> import blocks (e.g. to create a voucher/master). */
  async importData(reportName: string, tallyMessageXml: string): Promise<any> {
    const xml = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>${reportName}</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${this.company ?? ""}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        ${tallyMessageXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    let responseText: string;
    try {
      const res = await axios.post(this.url, xml, {
        headers: { "Content-Type": "text/xml" },
        timeout: this.timeoutMs,
      });
      responseText = res.data;
    } catch (err: any) {
      const detail = err.code === "ECONNREFUSED"
        ? `Could not connect to Tally at ${this.url}. Make sure Tally is running with the HTTP gateway enabled.`
        : err.message;
      throw new TallyError(`Import request to Tally failed: ${detail}`);
    }

    const parsed = parser.parse(responseText);
    const created = parsed?.RESPONSE?.CREATED ?? parsed?.ENVELOPE?.CREATED;
    const errors = parsed?.RESPONSE?.LINEERROR ?? parsed?.ENVELOPE?.LINEERROR;
    if (errors) {
      const msg = Array.isArray(errors) ? errors.join("; ") : String(errors);
      throw new TallyError(`Tally rejected the import: ${msg}`, responseText);
    }
    return { created: created ?? 0, raw: parsed };
  }
}

/** Escapes text for safe inclusion inside Tally XML element bodies. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
