# Cursor

**Verified against:** <https://docs.cursor.com/context/mcp> (the official MCP
page; the "Configuration locations", "Config interpolation" and example blocks
below are quoted from it).

## Where the file is

| Scope | Path |
|---|---|
| Project | `.cursor/mcp.json` inside your repository |
| Global | `~/.cursor/mcp.json` in your home directory |

Project scope is documented for "project-specific tools" and is meant to be
committed, so the whole team gets the server. Put secrets behind interpolation
(below) if you do.

## The config

Project scope, stdio — this is `cursor-mcp.json` in this directory, and it uses
Cursor's `${workspaceFolder}` so you do not have to hard-code a project path:

```json
{
  "mcpServers": {
    "catalogue": {
      "command": "node",
      "args": ["${workspaceFolder}/content/typescript/dist/typescript/src/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

The top-level key is `mcpServers`. Cursor, like Claude Desktop and Claude Code,
reads an entry with no `type` as a stdio server.

## Environment variables

Cursor interpolates variables in `command`, `args`, `env`, `url` and `headers`.
Documented syntax:

| Variable | Meaning |
|---|---|
| `${env:NAME}` | an environment variable from the process that launched Cursor |
| `${userHome}` | your home directory |
| `${workspaceFolder}` | the project root containing `.cursor/mcp.json` |
| `${workspaceFolderBasename}` | the name of that folder |
| `${pathSeparator}`, `${/}` | the OS path separator |

That gives you a clean split for secrets — the token stays in your shell
environment and never appears in a committed file:

```json
"env": { "CATALOGUE_API_KEY": "${env:CATALOGUE_API_KEY}" }
```

Cursor's docs use this form for their own remote-server examples, and recommend
it explicitly for OAuth client secrets.

## Remote / HTTP servers

Cursor takes a `url` instead of a `command`:

```json
{
  "mcpServers": {
    "catalogue-http": {
      "url": "http://127.0.0.1:8765/mcp",
      "headers": { "Authorization": "Bearer ${env:MCP_AUTH_TOKEN}" }
    }
  }
}
```

Because `headers` supports interpolation, the HTTP transport is the one place
where Cursor lets you keep a credential entirely out of the config file. Use it.

## Things that specifically go wrong with Cursor

**`${workspaceFolder}` in a global config.** The global `~/.cursor/mcp.json` has
no workspace, so the variable is empty and you get a path of
`/content/typescript/...`. Use an absolute path in the global file.

**A stale build.** Cursor launches the process once at startup. If you rebuild
(`npm run build`) while Cursor is open, the running server is still the old
code. Use Cursor's MCP refresh action, or restart Cursor, after a rebuild. This
costs people a lot of confusion when they change a tool description and the
model keeps seeing the old one.

**Node version.** Cursor is an Electron application and its `PATH` may include a
bundled Node that is older than the `engines.node` in `package.json`
(`>=20.11`). If the server exits instantly, run `node --version` with the exact
binary Cursor would find, or use an absolute path to your own Node.
