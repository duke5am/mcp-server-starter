# Transports: stdio and Streamable HTTP

MCP is transport-agnostic. The specification defines two standard transports and
allows custom ones:

> The protocol currently defines two standard transport mechanisms for
> client-server communication: **stdio**, communication over standard in and
> standard out; **Streamable HTTP**
>
> — [Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

This kit implements both, from one codebase, selected at startup. This document
covers which to use and the failure modes each one has.

---

## 1. Which one

| | stdio | Streamable HTTP |
|---|---|---|
| Who starts the server | the client, as a child process | it runs as a service |
| Relationship to caller | same user, same machine, same privileges | none |
| Authentication | **none needed** — the OS is the boundary | **required** |
| Reachable from | only the client that spawned it | anything that can reach the socket |
| Lifetime | the client's session | independent; multiple clients, many sessions |
| Deployment | none; it is a path in a config file | a process supervisor, a port, TLS if exposed |
| Multiple clients | no | yes |
| Server → client notifications | yes, over the same pipe | yes, via SSE streams |
| Debugging | hard (see §3) | easy (`curl`) |

**Use stdio when the server runs on the same machine as the client.** That is
almost always: it is what every desktop client expects, it needs no port, no
credential, no supervisor, and the lifetime is managed for you.

**Use Streamable HTTP when the server must run somewhere the client is not** — a
shared host, a container, a colleague's laptop, a CI runner. It is also the right
answer when several clients need the same server, or when you want to run the
server as a normal service with normal service tooling: health checks, metrics,
rolling restarts, log aggregation.

A useful rule: if you are tempted to run stdio over SSH or in a container to
share it, you want HTTP. That is what it is for.

### Streamable HTTP replaces HTTP+SSE

The old `HTTP+SSE` transport (protocol version `2024-11-05`) is deprecated. The
specification calls Streamable HTTP its replacement and documents a
backwards-compatibility dance for clients that must support both. This kit
implements Streamable HTTP only. For the record, the SDK's
`SUPPORTED_PROTOCOL_VERSIONS` in 1.30.0 is:

```js
export const LATEST_PROTOCOL_VERSION = '2025-11-25';
export const DEFAULT_NEGOTIATED_PROTOCOL_VERSION = '2025-03-26';
export const SUPPORTED_PROTOCOL_VERSIONS = [LATEST_PROTOCOL_VERSION, '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];
```

You do not set the protocol version yourself; the SDK negotiates it during
`initialize`.

---

## 2. The stdout-is-the-protocol rule

This is the single most important operational fact about stdio, and it is stated
flatly in the specification:

> The server reads JSON-RPC messages from its standard input (stdin) and sends
> messages to its standard output (stdout).
>
> Messages are individual JSON-RPC requests, notifications, or responses.
>
> Messages are delimited by newlines, and MUST NOT contain embedded newlines.
>
> **The server MAY write UTF-8 strings to its standard error (stderr) for
> logging purposes. Clients MAY capture, forward, or ignore this logging.**
>
> **The server MUST NOT write anything to its stdout that is not a valid MCP
> message.**

On stdio, **stdout is the wire**. It is not a console, not a log sink, not a
place for a banner. A client reading it expects one JSON-RPC object per line,
and nothing else.

### Why stdio servers must never print banners or use console.log

A single `console.log('server started')` puts the line `server started` into the
protocol stream. What happens next depends on the client, and all the options
are bad:

- the parser fails on that line and tears the session down — the server
  "connects then immediately disconnects", with no useful error;
- the client skips unparseable lines, so it mostly works, until the day a
  library prints a deprecation warning *between* a request and its response and
  the client never resolves that call, so a tool call hangs forever;
- worst case, the injected line happens to be valid JSON, gets parsed as a
  message, and produces a protocol error nobody can reproduce.

The third case is why the rule is "MUST NOT write anything", not "should not
write anything confusing".

**What this kit does:**

1. **Every diagnostic goes to stderr**, through `src/logger.ts`, as one JSON
   object per line. The logs are structured, so they can be shipped to a log
   pipeline without a parser, but they are on the right stream.
2. **`--help` and error messages go to stderr.** Even the usage text. There is a
   test that spawns the server with `--help` and asserts `stdout === ''`,
   because this is exactly the sort of thing that regresses when somebody adds a
   CLI flag years later.
3. **A development guard.** Set `MCP_GUARD_STDOUT=1` and the server wraps
   `process.stdout.write` and logs a loud `stdout_guard_violation` on stderr —
   with the stack frame that did it — for anything that is not a JSON-RPC
   message. It cannot un-write the bytes, but it names the culprit in seconds
   instead of hours.
4. **A test that parses the raw pipe.** `tests/protocol-hygiene.test.ts` spawns
   the server, drives it by hand over raw pipes, and asserts that every line on
   stdout parses as JSON, that every object has `"jsonrpc": "2.0"`, that the
   number of response lines exactly equals the number of requests (which is what
   catches an extra banner), and that no logger text appears in stdout. It also
   asserts that stderr receives well-formed log records, so "logging works" is
   proven rather than assumed.

### The same rule, differently worded for library authors

If you build on a library that writes to stdout — a progress bar, a colour
helper, a JDBC-style driver with a debug flag — you have three options: silence
it, redirect it, or do not use it. Redirecting `process.stdout.write` to stderr
inside your server is a legitimate and common fix:

```js
// Redirect BEFORE anything else runs, if a dependency insists on printing.
const realWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, enc, cb) => process.stderr.write(chunk, enc, cb);
```

Do this only if you must, and never after the transport has started.

---

## 3. stdio in practice

### Starting it

The client runs a command. There is no port and no URL — `command`, `args`,
`env` and `cwd` are the whole interface. See `../clients/` for the exact shape
each client expects, and note the two rules that cause most failures: **use
absolute paths**, and **do not rely on `PATH`** for a GUI client on macOS.

### Debugging it

The awkward part of stdio is that the "network" is a pipe owned by the client,
so you cannot watch it with normal tools. Options, best first:

1. **Read stderr.** Our logger makes every call visible:
   `{"event":"tool_call","tool":"get_service","ok":true,"duration_ms":3,...}`.
   Claude Desktop writes server stderr to
   `~/Library/Logs/Claude/mcp-server-<name>.log` on macOS. Start here.
2. **Run it by hand.** Paste the command from your client config into a
   terminal. A working server prints a log line and then sits there waiting. If
   it exits, the error is now in front of you.
3. **Feed it a message.**
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"cli","version":"1"}}}' \
     | node dist/typescript/src/index.js
   ```
   You should get exactly one JSON line back on stdout and log lines on stderr.
4. **MCP Inspector** is the official interactive debugging tool for exactly this.

### Shutdown, and a gap in the SDK worth knowing about

`SIGINT` and `SIGTERM` are handled: the server closes the transport, logs
`shutdown_complete`, and exits 130/143.

But there is a subtlety. **The stdio transport does not report stdin EOF.** In
`@modelcontextprotocol/sdk` 1.30.0, `dist/esm/server/stdio.js#start()` subscribes
to stdin's `'data'` and `'error'` events only — there is no `'end'` listener, so
`onclose` never fires when a client closes the pipe. Which is how most clients
terminate a server. Without handling it, the process still exits (the event loop
runs dry), but silently: no shutdown log, no cleanup, in-flight work abandoned.

So `src/index.ts` installs its own `'end'` and `'close'` listeners on stdin and
turns them into an orderly shutdown, logging `stdin_eof` first. That is the
entire content of "graceful shutdown on client disconnect" for stdio, and the
test suite asserts both log lines appear.

(This is the general shape of the thing: transports give you the protocol, not
the operational behaviour. Anything you want to happen on disconnect, you
implement.)

### stdout buffering

`process.exit()` can truncate buffered stderr when stderr is a pipe — precisely
the shutdown lines an operator needs. This server sets `process.exitCode` and
lets the event loop drain, with an unref'd 2-second timer as a hard backstop.
The details, and why, are commented in `src/index.ts`.

---

## 4. Streamable HTTP in practice

### The endpoint

> The server MUST provide a single HTTP endpoint path (hereafter referred to as
> the MCP endpoint) that supports both POST and GET methods.

This server's MCP endpoint is **`/mcp`**, and it also serves an unauthenticated
`GET /healthz` for probes. Everything else is a 404 that says where the endpoint
is.

Request handling follows the specification: every client message is a POST with
`Accept: application/json, text/event-stream`; an initialize request with no
session ID creates a session and returns `Mcp-Session-Id`; subsequent requests
carry that header. The SDK's transport does the protocol work; this kit adds the
security and rate limiting around it.

### Session handling and its implications

This server runs in **stateful** mode: one `StreamableHTTPServerTransport` and
one `McpServer` per session, keyed by a `crypto.randomUUID()` session ID. The
implications are worth being explicit about, because they drive deployment:

- **State is in memory.** A session lives in the process that created it. Two
  server instances behind a load balancer without sticky sessions will produce
  `404 Unknown session` responses as requests land on the wrong instance. Either
  pin sessions (sticky routing on `Mcp-Session-Id`), or run **stateless**
  (`new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`) when
  your tools genuinely hold no per-session state — which is true of every tool
  in this kit.
- **A restart invalidates every session.** That is correct behaviour, not a bug:
  the specification says a client receiving `404` for a session ID "MUST start a
  new session by sending a new InitializeRequest without a session ID". Clients
  handle it. Rolling restarts are therefore safe, but every client re-initialises.
- **Unknown or expired session ID ⇒ `404`.** A non-initialize POST with no
  session ID at all ⇒ `400`. Both are per the specification.
- **Sessions are not authentication.** From the Security Best Practices page:
  "MCP Servers MUST NOT use sessions for authentication." This server
  re-validates the bearer token on every request and never treats possession of
  a session ID as authorisation.
- **`DELETE` closes a session.** The SDK's `onsessionclosed` callback removes it
  from the map. The server also cleans up on transport close.
- **Session IDs must be unguessable.** `crypto.randomUUID()`, per the spec's
  "MUST only contain visible ASCII characters" plus the "secure, non-deterministic"
  requirement.

### Authentication, Origin and Host

All three are mandatory for a network-exposed MCP server, and all three are
implemented in `src/http.ts`. The specification's warning is quoted there in
full; the short version:

- `Origin`, when present, must be allow-listed or the request is `403`. Browsers
  always send it, MCP clients do not, so an empty allow-list is the safe default.
- `Host` must be a loopback address we bound to, or an explicitly configured
  extra, or `403`. This is the DNS-rebinding defence.
- Missing or wrong bearer token ⇒ `401` with `WWW-Authenticate: Bearer`. The
  server **refuses to start** if `MCP_AUTH_TOKEN` is unset.

`SECURITY.md` §2 has the full table and the reasoning.

### Response mode: SSE or one JSON object

`enableJsonResponse: false` (the default, and the specification's preference)
answers a POST with `Content-Type: text/event-stream` and streams the response as
SSE. `true` returns a single `application/json` object instead. The specification
requires clients to support both.

- **SSE** is the default and supports server-initiated notifications on the
  response stream. It is also harder to inspect with `curl` and harder to pass
  through naive proxies and some corporate TLS-inspecting middleboxes.
- **One JSON object** is simpler to proxy, simpler to log, and simpler to debug.
  Use it when you do not need streaming.

This kit's tests exercise both: the raw status-code assertions run against a
JSON-response server so the body can be inspected, and a real MCP client is
driven against a default SSE server to prove the standard path works.

### GET, DELETE, and what this endpoint actually does

Verified by running it, because an earlier draft of this document got it wrong:

| Request | Response |
|---|---|
| `POST /mcp` with an initialize request, no session | `200`, an `Mcp-Session-Id` header, and the `InitializeResult` |
| `POST /mcp` with an unknown or expired session id | `404` — the signal for a client to re-initialise |
| `POST /mcp` with no session id and not an initialize request | `400` |
| `GET /mcp` with no session id | `400`, with a message explaining that a session id is required for GET and DELETE |
| `GET /mcp` with a valid session id | `200`, `Content-Type: text/event-stream`, and the body **stays open** — this is the standalone SSE stream the specification says a server MAY offer at its MCP endpoint |
| `DELETE /mcp` with a valid session id | `200`, session terminated |
| `GET /mcp` with the id of a deleted session | `404` |

The own earlier mistake is worth spelling out, because it is the kind of claim
that reads as authoritative and is simply false: the first version of this file
asserted that `GET /mcp` returned `405`. It does not — the SDK serves the
standalone stream, and a server that genuinely does not offer one is the case
that returns `405`. All four rows above are now covered by tests in
`tests/auth.test.ts` rather than by prose.

### Rate limiting at two layers

| Layer | Where | On exceeding |
|---|---|---|
| Edge, per HTTP request | before JSON-RPC parsing | `429` + `Retry-After` |
| Tool, per credential | inside the tool wrapper | `isError` result, code `RATE_LIMITED`, `retry_after_ms` |

They exist for different reasons. The edge limit protects the process from
request floods. The tool limit protects a specific expensive call from a
well-behaved client in a retry loop, and because it is a tool result rather than
a transport error, the *model* is told to slow down rather than being handed an
opaque failure at the HTTP layer.

Both are **non-blocking**. A rate limiter that sleeps turns a busy server into a
stuck one: on stdio the client looks hung, and on HTTP you hold a request open
while an agent — which is very good at retrying — piles more on top.

### Deployment notes

- **Bind loopback by default.** `MCP_HOST=127.0.0.1`. Going to `0.0.0.0` should
  be a decision someone made on purpose, and if you make it, add the hostname to
  `MCP_ALLOWED_HOSTS`.
- **TLS belongs in front.** This server speaks plain HTTP. Put it behind a
  reverse proxy that terminates TLS, and keep the upstream on loopback.
- **`/healthz` is unauthenticated on purpose** so probes and restart policies
  can use it without a credential, and it is exempt from the edge rate limit so
  a probe never fails alarmingly. It leaks a server name, a version, a session
  count and an uptime — decide whether that is acceptable on your network.
- **A reverse proxy must not buffer the SSE stream.** If you use SSE mode, disable
  response buffering for `/mcp` (`proxy_buffering off` in nginx) or responses
  arrive in one lump after the connection closes, which some clients interpret
  as a timeout.
- **Graceful shutdown matters here too.** `SIGTERM` closes every live session and
  then the listener, so an orchestrator draining connections gets a clean stop.
- **Logs go to stderr, so a supervisor captures them normally.** No files are
  written.

---

## 5. A test matrix

Everything below is covered by the shipped suite, except where noted:

| Case | Covered | Where |
|---|---|---|
| In-process client, all six tools, success and error paths | yes | `tests/inprocess.test.ts` |
| Real child process over stdio, `listTools` + every tool | yes | `tests/stdio.e2e.test.ts` |
| Raw pipe: stdout is valid JSON-RPC only, logs on stderr | yes | `tests/protocol-hygiene.test.ts` |
| Stdin EOF and `SIGTERM` produce a clean, logged shutdown | yes | `tests/stdio.e2e.test.ts` |
| HTTP 401 for missing and for wrong credentials | yes | `tests/auth.test.ts` |
| HTTP 403 for a hostile Origin and Host | yes | `tests/auth.test.ts` |
| HTTP 404 for an unknown session, 400 for a sessionless non-initialize | yes | `tests/auth.test.ts` |
| `GET /mcp` standalone SSE stream, and `DELETE` session termination | yes | `tests/auth.test.ts` |
| Real MCP client over the real HTTP transport, SSE responses | yes | `tests/auth.test.ts` |
| Tool rate limit ⇒ `RATE_LIMITED` tool result | yes | `tests/ratelimit.test.ts` |
| Edge rate limit ⇒ HTTP 429 + `Retry-After` | yes | `tests/ratelimit.test.ts` |
| Behaviour under a load balancer without sticky sessions | **no** | reasoning only, §4 |
| TLS termination | **no** | out of scope; use a reverse proxy |
| OAuth 2.1 resource-server flows | **no** | out of scope; see `SECURITY.md` |
