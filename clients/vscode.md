# VS Code (GitHub Copilot agent mode)

**Verified against:** <https://code.visualstudio.com/docs/copilot/customization/mcp-servers>
and the field-by-field reference at
<https://code.visualstudio.com/docs/copilot/reference/mcp-configuration>.

## Where the file is

| Scope | How |
|---|---|
| Workspace | `.vscode/mcp.json` — commit it so the team shares the server |
| User profile | Command Palette → **MCP: Open User Configuration** |
| Guided flow | Command Palette → **MCP: Add Server**, choose Workspace or Global |

The docs also note that for Agent Host sessions VS Code forwards your
configuration rather than reading `.vscode/mcp.json` directly, and that a
workspace `.mcp.json` or `~/.copilot/mcp-config.json` is read natively by the
Agent Host. If your server works in one mode and not the other, that is why.

## THE BIG DIFFERENCE: `servers`, not `mcpServers`

VS Code's top-level key is **`servers`**, and a local server **requires**
`"type": "stdio"`:

```json
{
  "servers": {
    "catalogue": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/content/typescript/dist/typescript/src/index.js"],
      "env": { "MCP_TRANSPORT": "stdio", "MCP_LOG_LEVEL": "info" }
    }
  }
}
```

Paste a Claude Desktop or Cursor block in here verbatim and VS Code will show no
server and, by default, no error. The key is simply not recognised.

## Documented fields for a stdio server

| Field | Required | Notes |
|---|---|---|
| `type` | Yes | `"stdio"` |
| `command` | Yes | "Must be available on your system path or contain its full path" |
| `args` | No | array of strings |
| `cwd` | No | "Defaults to the workspace folder when run in a workspace" |
| `env` | No | "Values can be strings, numbers, or null" |
| `envFile` | No | path to an env file, e.g. `"${workspaceFolder}/.env"` |
| `dev` | No | watch/debug settings, e.g. `{"watch": "src/**/*.ts"}` |
| `sandboxEnabled` | No | macOS and Linux only |

`cwd` defaulting to the workspace folder is worth knowing: it means a relative
`args` path sometimes works in VS Code and then fails in Claude Desktop, which
has a different working directory. Prefer absolute paths in both.

## Remote servers

```json
{ "servers": { "catalogue-http": { "type": "http", "url": "http://127.0.0.1:8765/mcp" } } }
```

`sse` and `ws` are also valid `type` values.

## Secrets: `inputs`, not literals

VS Code's reference says plainly: *"Avoid hardcoding sensitive information like
API keys. Use input variables or environment files instead."* The `inputs` array
is a sibling of `servers`:

```json
{
  "inputs": [
    { "type": "promptString", "id": "mcp-token", "description": "Bearer token", "password": true }
  ],
  "servers": {
    "catalogue-http": {
      "type": "http",
      "url": "http://127.0.0.1:8765/mcp",
      "headers": { "Authorization": "Bearer ${input:mcp-token}" }
    }
  }
}
```

`${input:...}` prompts once and stores the value in VS Code's secret storage, so
nothing sensitive is written into `.vscode/mcp.json`.

## Sandboxing (macOS and Linux)

VS Code can run a stdio server under a filesystem and network sandbox. It is a
top-level `sandbox` object, a sibling of `servers`, with
`filesystem.allowWrite`, `filesystem.denyRead`, `filesystem.denyWrite`,
`network.allowedDomains` and `network.deniedDomains`. Enable it per server with
`"sandboxEnabled": true`, then check the server's output for permission errors
and widen the rules.

Two notes from the docs that matter operationally: *"When sandboxing is enabled,
tool confirmations are auto-approved because the server runs in a controlled
environment"* — so the sandbox config becomes your only control — and it is not
available on Windows.

For this server the sandbox is a genuinely good fit: it reads a fixed dataset
and needs no network and no filesystem access at all.
