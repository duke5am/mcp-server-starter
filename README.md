# mcp-server-starter

A **minimal, working MCP server** over stdio — in TypeScript and Python — with the
three things every toy example gets wrong already handled.

```bash
# TypeScript
cd typescript && npm install && npm run build
node tests/e2e-node.mjs          # drives it with a real MCP client

# Python
cd python && pip install -e .
python ../tests/e2e-python.py
```

```
tools: list_services, get_service, search_services
  list_services({}) isError=False
     -> auth-gateway (identity)
        ledger (payments)
        search-indexer (search)
  get_service({"id":"ledger"}) isError=False
     -> Ledger — payments — https://ledger.example.com
  get_service({"id":"nope"}) isError=True
     -> Unknown service id 'nope'. Known ids: auth-gateway, ledger, search-indexer
```

Three tools, a read-only dataset, and a test that actually connects. Replace the
dataset with your own and the shape stays the same.

## The three rules it demonstrates

**1. stdout is the protocol channel.** A single `console.log` or `print()` in an
stdio server injects non-JSON-RPC bytes into the stream and corrupts the session
— often intermittently, which is worse. Every log here goes to **stderr** as
structured JSON:

```json
{"level":"info","msg":"services-mcp-server ready on stdio"}
```

There is a test that asserts every stdout line parses as JSON-RPC 2.0.

**2. Errors are results, not exceptions.** A thrown error gets wrapped by the SDK
with a generic prefix and can lose the actionable detail. Returning an explicit
error result keeps the message intact and `is_error` unambiguous — so the model
can read it and correct itself:

```
Unknown service id 'nope'. Known ids: auth-gateway, ledger, search-indexer
```

**3. Tool descriptions say when NOT to use the tool.** A description is
model-visible text and part of your interface. `list_services` says *"Do NOT use
it to look up a single service you can already name"* — because a model with no
guidance will call the broad tool when the narrow one is correct.

## Client configuration

`clients/` has ready-to-paste config for **Claude Desktop, Claude Code, Cursor
and VS Code**, each verified against that client's own documentation.

**The trap:** VS Code uses `servers` with an explicit `"type": "stdio"`, while
everyone else uses `mcpServers`. Copying one client's block into another's file
is the most common reason a server "does not appear".

Also: paths must be **absolute**, and env vars for secrets do not belong in a
checked-in config.

## Transports

`TRANSPORTS.md` covers stdio versus streamable HTTP and when each is right. The
short version: **stdio inherits the privileges of whoever launched it**, so it has
no network surface and needs no auth; **HTTP is reachable by anything that can open
a socket**, so it must authenticate. The starter is stdio-only on purpose.

## What is not here

- No HTTP transport, no auth, no rate limiting — those are genuinely needed when
  you expose a server over the network, and adding them here would bury the three
  rules above. They are in the full kit.
- No OAuth. If you are putting this on the internet, a shared bearer token is a
  floor, not a solution.
- **Prompt injection is not solved by any starter.** Tool results are untrusted
  input to the model; a tool that reads user-controlled content can be used to
  instruct the agent. Keep tools least-privilege and never let a side effect
  happen automatically.

## Version pinning

`@modelcontextprotocol/sdk` **1.30.0** and `mcp` **2.2.0** are pinned exactly.
Three behaviours this code depends on are version-specific — including that the
Python high-level server is `mcp.server.mcpserver.MCPServer`, which is **not** the
1.x `FastMCP` class. Treat an SDK upgrade as a code review.

## The full pack

The paid kit adds the HTTP transport with bearer auth and Origin/Host validation,
token-bucket rate limiting, a six-tool worked server, the `SECURITY.md` and
`TOOL-DESIGN.md` guides, and **287 tests** including an end-to-end stdio suite.

→ **Production MCP Server Kit**: <!-- GUMROAD-LINK -->
