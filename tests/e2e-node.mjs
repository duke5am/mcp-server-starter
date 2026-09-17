// Drives the TypeScript server over stdio with a real MCP client.
// Build first:  cd typescript && npm install && npm run build
// Run:          node tests/e2e-node.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const t = new StdioClientTransport({ command: "node", args: [new URL("../typescript/dist/server.js", import.meta.url).pathname] });
const c = new Client({ name: "e2e", version: "1.0.0" });
await c.connect(t);

const { tools } = await c.listTools();
console.log("tools:", tools.map(x => x.name).join(", "));

const call = async (name, args) => {
  const r = await c.callTool({ name, arguments: args });
  const text = (r.content ?? []).filter(x => x.type === "text").map(x => x.text).join(" | ");
  console.log(`  ${name}(${JSON.stringify(args)}) isError=${!!r.isError}`);
  console.log(`     -> ${text.slice(0, 110)}`);
};

await call("list_services", {});
await call("list_services", { team: "payments" });
await call("get_service", { id: "ledger" });
await call("search_services", { query: "SEARCH" });
await call("get_service", { id: "nope" });      // must be isError, not a crash

await c.close();
console.log("closed cleanly");
