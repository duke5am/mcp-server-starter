# Client configuration

Ready-to-paste configuration for talking to this server from the four clients
that matter for development work. Each file here contains a real, complete
config — not a fragment — so you can copy it and change only the paths.

| Client | Config file | Top-level key | Verified against official docs |
|---|---|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)<br>`%APPDATA%\Claude\claude_desktop_config.json` (Windows) | `mcpServers` | Yes — <https://modelcontextprotocol.io/quickstart/user> |
| Cursor | `.cursor/mcp.json` (project)<br>`~/.cursor/mcp.json` (global) | `mcpServers` | Yes — <https://docs.cursor.com/context/mcp> |
| VS Code (GitHub Copilot agent mode) | `.vscode/mcp.json` (workspace)<br>user profile, via the `MCP: Open User Configuration` command | `servers` | Yes — <https://code.visualstudio.com/docs/copilot/reference/mcp-configuration> |
| Claude Code (CLI) | `.mcp.json` (project, committable)<br>`~/.claude.json` (local) | `mcpServers` | Yes — <https://docs.claude.com/en/docs/claude-code/mcp> |

**The one difference that catches everybody:** VS Code uses `"servers"` at the
top level and requires `"type": "stdio"`. Claude Desktop, Cursor and Claude Code
use `"mcpServers"`, and read an entry with no `type` as a stdio server. Copying a
Claude Desktop block into `.vscode/mcp.json` produces a server that silently
never appears. That is not a bug you will find by reading logs, because there
are no logs — the client simply does not see the entry.

## Build first — there is nothing to point at yet

The stdio clients run a **command**, so the server must exist on disk as
JavaScript before any of these configs will work:

```bash
cd typescript
npm install
npm run build          # produces dist/typescript/src/index.js
```

## The absolute-path rule

Every client here spawns the server itself, and several of them do not run in
your project directory. There is no shell and no `cd` — `command` and `args` are
passed to `execve` as-is.

Consequences:

- **`command` must be an absolute path, or a bare executable name that resolves
  on `PATH`.** `"command": "node"` works if `node` is on the `PATH` the client
  inherits; that is not guaranteed for a GUI app on macOS, which inherits the
  `PATH` from `launchd`, not from your shell. `"command": "npx"` frequently does
  not resolve there at all. When in doubt, use the absolute path:

  ```bash
  which node          # macOS/Linux: e.g. /usr/local/bin/node
  ```

- **`args` entries must be absolute paths.** `"args": ["dist/src/index.js"]` is
  resolved against the client's working directory, which is usually `/`. Use
  `/Users/you/projects/catalogue-mcp-server/dist/typescript/src/index.js`.

- **`~` is not expanded.** It is a shell feature, and no shell is involved.

- On Windows, use forward slashes or doubled backslashes inside JSON. A single
  `\` is an escape character and will produce a JSON parse error.

## Environment variables and API keys

There are three mechanisms, and they are not interchangeable:

1. **`env` inside the server entry** — a literal map handed to the child
   process. Simple, and the value ends up in a config file you might commit.
2. **`envFile` (VS Code only)** — points at a `.env` file to load.
3. **Client-level interpolation of your shell environment** — the secret stays
   out of the config file entirely. Syntax differs per client:

   | Client | Syntax | Usable in |
   |---|---|---|
   | Cursor | `${env:NAME}` | `command`, `args`, `env`, `url`, `headers` |
   | VS Code | `${input:name}` with an `inputs` array | any string field |
   | Claude Code | `${NAME}` and `${NAME:-default}` | `command`, `args`, `env`, `url`, `headers` |
   | Claude Desktop | none documented | — |

   For Claude Desktop, `env` literals are the only supported route, so keep the
   file out of version control.

**The `env` mechanism is not a security boundary.** On the stdio transport the
client passes the environment to a child process running as you. Any process
running as your user can read it (`/proc/<pid>/environ` on Linux, `ps eww` on
macOS). That is fine for `MCP_LOG_LEVEL`; it is not a place for a long-lived
production credential. See `../docs/SECURITY.md`.

For the HTTP transport, secrets do not go in the config's `env` at all. They go
in the client's own credential store or a header, and the server never sees a
plaintext token on disk. `claude-code.md` and `cursor.md` show those forms.

## Choosing stdio or HTTP

The stdio configs are what you want 95% of the time: the client manages the
process lifetime, there is no port, and there is no credential to distribute.
Use the HTTP configs when the server must run somewhere the client is not — a
shared host, a container, a laptop that is not yours — and read
`../docs/TRANSPORTS.md` first, because HTTP brings authentication, session
handling and deployment questions that stdio does not.

## Files

- `claude-desktop.md` / `claude-desktop.json`
- `cursor.md` / `cursor-mcp.json`
- `vscode.md` / `vscode-mcp.json`
- `claude-code.md` / `claude-code.mcp.json`
