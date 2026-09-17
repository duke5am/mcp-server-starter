# Claude Code (CLI)

**Verified against:** <https://docs.claude.com/en/docs/claude-code/mcp>.

## Three ways to add a server

**1. A command (simplest for stdio).** Everything after `--` is passed to the
server untouched, so the server's own flags do not get eaten by Claude Code:

```bash
claude mcp add --transport stdio catalogue -- node /abs/path/to/dist/typescript/src/index.js
```

With an environment variable:

```bash
claude mcp add \
  --env MCP_LOG_LEVEL=debug \
  --transport stdio catalogue \
  -- node /abs/path/to/dist/typescript/src/index.js
```

**2. A JSON blob**, for when you already have a `mcpServers` block from another
client:

```bash
claude mcp add-json catalogue '{"command":"node","args":["/abs/path/to/dist/typescript/src/index.js"]}'
```

**3. A project-scoped `.mcp.json`** at your repository root, committed so the
whole team gets it. This is `claude-code.mcp.json` in this directory:

```json
{
  "mcpServers": {
    "catalogue": {
      "type": "stdio",
      "command": "node",
      "args": ["/abs/path/to/content/typescript/dist/typescript/src/index.js"],
      "env": { "MCP_LOG_LEVEL": "${MCP_LOG_LEVEL:-info}" }
    }
  }
}
```

## Scopes

The docs describe three, with a precedence order that matters when the same
server name appears in more than one:

| Scope | Where it lives | Use |
|---|---|---|
| `local` (default) | `~/.claude.json`, private to you | personal experiments |
| `project` | `.mcp.json` at the project root, committable | the team's shared server |
| `user` | available in all your projects | servers you always want |

`claude mcp add` writes to local scope unless you pass `--scope project` or
`--scope user`.

## An easy mistake to avoid

*"A JSON entry that has a `url` but no `type` is a configuration error, because
Claude Code reads an entry with no `type` as a stdio server."* It skips the
server and tells you so. Always set `"type": "http"` (the alias
`"streamable-http"` is also accepted) on a remote entry.

That alias exists because *"the MCP specification uses the name
`streamable-http` for this transport, so configurations copied from server
documentation work without modification."*

## HTTP with a bearer token

```json
{
  "mcpServers": {
    "catalogue-http": {
      "type": "http",
      "url": "http://127.0.0.1:8765/mcp",
      "headers": { "Authorization": "Bearer ${MCP_AUTH_TOKEN}" }
    }
  }
}
```

The equivalent one-liner, which keeps the token in your shell history instead of
a file:

```bash
claude mcp add --transport http catalogue-http http://127.0.0.1:8765/mcp \
  --header "Authorization: Bearer $MCP_AUTH_TOKEN"
```

## Environment variable expansion

Claude Code expands `${VAR}` and `${VAR:-default}` in `command`, `args`, `env`,
`url` and `headers`. Two documented behaviours are worth knowing before you rely
on it:

- An unset variable **without** a default expands to an empty string, so
  `"${MCP_LOG_LEVEL}"` silently becomes `""` and the server falls back to its
  own default. Use `${MCP_LOG_LEVEL:-info}` when you want an explicit fallback.
- A credential variable that reads as empty is treated as unset for the purposes
  of the credential warning, which can make a misconfigured server look fine in
  `/mcp` until the first request fails with 401.

Use `/mcp` inside a session to see connection status and which tools each server
contributed.
