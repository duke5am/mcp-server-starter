# Claude Desktop

**Verified against:** <https://modelcontextprotocol.io/quickstart/user> (the
official "Connect to local MCP servers" guide, which uses Claude Desktop as its
worked example).

## Where the file is

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

You do not have to remember that. In Claude Desktop: **Settings → Developer →
Edit Config**. That creates the file if it does not exist and opens it in your
editor. Then **fully quit and restart** Claude Desktop — closing the window is
not enough; the config is read at startup.

## The config

`claude-desktop.json` in this directory is complete. Copy it, then change the
two absolute paths:

```json
{
  "mcpServers": {
    "catalogue": {
      "command": "/usr/local/bin/node",
      "args": [
        "/Users/YOU/projects/37-mcp-server-kit/content/typescript/dist/typescript/src/index.js"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

## Things that specifically go wrong with Claude Desktop

**`command` is not found.** Claude Desktop on macOS is a GUI application and
inherits the `PATH` from `launchd`, which is typically
`/usr/bin:/bin:/usr/sbin:/sbin` — it does **not** include `/usr/local/bin`,
Homebrew's `/opt/homebrew/bin`, or an `nvm` shim directory. `"command": "node"`
fails with no error message visible anywhere. Fix it by using the absolute path
from `which node`, as above. This is the single most common reason a working
server "doesn't show up" in Claude Desktop.

**`npx` does not work.** Same cause, plus `npx` would try to install a package
into a directory you cannot see. Run the server directly instead.

**`~` is not expanded.** `"args": ["~/projects/.../index.js"]` produces a
literal path starting with a tilde and the process exits immediately.
`fileURLToPath`-style resolution does not happen; there is no shell.

**No console output.** On macOS, MCP server stderr goes to
`~/Library/Logs/Claude/mcp-server-<name>.log`. This is where your structured
logs land, and it is the first place to look when the server connects but
behaves oddly. On Linux/Windows builds, the same idea applies — stderr is
captured by the client, not printed to a terminal. Our logger writes JSON lines
there, so `tail -f` that file and you will see every `tool_call` with its
duration and correlation id.

**The tools do not appear.** In order: (1) is `dist/typescript/src/index.js`
actually present? Run `npm run build`. (2) does the file start with
`#!/usr/bin/env node`, and did you pass it to `node` rather than executing it
directly? (3) run the command from the config in a terminal by hand — if it
prints a JSON log line and then sits there waiting, it is working and the
problem is the config path.

**Don't add anything to `env` that you would not put in a git repository.** As
the official guide puts it, the server "runs with your user account
permissions". There is no sandbox and no credential prompt between the server
and your machine.

## Approvals

Claude Desktop asks for confirmation before executing a tool call. Every tool in
this server is annotated `readOnlyHint: true, destructiveHint: false`, which is
the signal clients use to decide how much friction to apply. The annotations are
hints, not enforcement — see `../docs/SECURITY.md`.
