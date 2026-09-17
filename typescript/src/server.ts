/**
 * A minimal, working MCP server over stdio.
 *
 * Three rules this file exists to demonstrate:
 *   1. stdout is the PROTOCOL channel. Log to stderr, never stdout —
 *      a stray console.log corrupts the JSON-RPC stream.
 *   2. Tools return errors as tool results (isError), not thrown exceptions,
 *      so the model can read the message and correct itself.
 *   3. Validate inputs and describe the tool precisely enough that a model
 *      knows when NOT to call it.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const log = (...args: unknown[]) =>
  process.stderr.write(JSON.stringify({ level: "info", msg: args.join(" ") }) + "\n");

// --- a tiny read-only dataset (replace with your own) -----------------------
type Service = { id: string; name: string; team: string; url: string };
const SERVICES: Service[] = [
  { id: "auth-gateway", name: "Auth Gateway", team: "identity", url: "https://auth.example.com" },
  { id: "ledger", name: "Ledger", team: "payments", url: "https://ledger.example.com" },
  { id: "search-indexer", name: "Search Indexer", team: "search", url: "https://search.example.com" },
];

const server = new McpServer({ name: "services-mcp-server", version: "1.0.0" });

// --- 1. list ----------------------------------------------------------------
server.registerTool(
  "list_services",
  {
    title: "List services",
    description:
      "List the internal services in the catalogue. Use this when you need to discover which " +
      "services exist, or to find the exact id to pass to get_service. Do NOT use it to look up " +
      "a single service you can already name — call get_service with the id instead.",
    inputSchema: {
      team: z.string().optional().describe("Only return services owned by this team"),
      limit: z.number().int().min(1).max(50).default(20).describe("Maximum rows to return"),
    },
  },
  async ({ team, limit }) => {
    const rows = SERVICES.filter((s) => !team || s.team === team).slice(0, limit);
    log(`list_services team=${team ?? "(any)"} -> ${rows.length}`);
    return {
      content: [{ type: "text", text: rows.map((s) => `${s.id} (${s.team})`).join("\n") || "none" }],
      structuredContent: { count: rows.length, services: rows },
    };
  },
);

// --- 2. get one -------------------------------------------------------------
server.registerTool(
  "get_service",
  {
    title: "Get one service",
    description:
      "Fetch a single service by its exact id, e.g. 'ledger'. Returns the owning team and URL. " +
      "If you do not know the id, call list_services first.",
    inputSchema: { id: z.string().min(1).describe("Exact service id, e.g. 'ledger'") },
  },
  async ({ id }) => {
    const svc = SERVICES.find((s) => s.id === id);
    if (!svc) {
      // An error the model can act on, as a tool result rather than a throw.
      const ids = SERVICES.map((s) => s.id).join(", ");
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown service id '${id}'. Known ids: ${ids}` }],
      };
    }
    return {
      content: [{ type: "text", text: `${svc.name} — ${svc.team} — ${svc.url}` }],
      structuredContent: svc as unknown as Record<string, unknown>,
    };
  },
);

// --- 3. search --------------------------------------------------------------
server.registerTool(
  "search_services",
  {
    title: "Search services",
    description:
      "Search service names, ids and teams for a substring. Use when you only remember part of a " +
      "name. Case-insensitive. Returns every match, so prefer list_services when you want the full set.",
    inputSchema: { query: z.string().min(1).describe("Substring to match, case-insensitive") },
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    const hits = SERVICES.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.team.toLowerCase().includes(q),
    );
    return {
      content: [
        {
          type: "text",
          text: hits.length
            ? hits.map((s) => `${s.id} — ${s.name} (${s.team})`).join("\n")
            : `No service matches '${query}'.`,
        },
      ],
      structuredContent: { count: hits.length, services: hits },
    };
  },
);

// --- start ------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("services-mcp-server ready on stdio");
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      log(`received ${sig}, shutting down`);
      void server.close().finally(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
