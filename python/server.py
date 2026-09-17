"""A minimal, working MCP server over stdio (Python).

Three rules this file exists to demonstrate:
  1. stdout is the PROTOCOL channel. Log to stderr, never stdout - a stray
     print() corrupts the JSON-RPC stream.
  2. Return errors as tool results the model can read, not exceptions.
  3. Describe each tool precisely enough that a model knows when NOT to call it.

SDK: `mcp.server.mcpserver.MCPServer` from mcp 2.2.0 (pinned). That is the
current high-level server in this release - it is not the 1.x `FastMCP` class.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, asdict

from mcp.server.mcpserver import MCPServer
from mcp.types import CallToolResult, TextContent


def log(event: str, **fields: object) -> None:
    """Structured log to STDERR. Never print to stdout."""
    sys.stderr.write(json.dumps({"event": event, **fields}) + "\n")
    sys.stderr.flush()


@dataclass(frozen=True)
class Service:
    id: str
    name: str
    team: str
    url: str


SERVICES: tuple[Service, ...] = (
    Service("auth-gateway", "Auth Gateway", "identity", "https://auth.example.com"),
    Service("ledger", "Ledger", "payments", "https://ledger.example.com"),
    Service("search-indexer", "Search Indexer", "search", "https://search.example.com"),
)

server = MCPServer(name="services-mcp-server", version="1.0.0")


@server.tool(
    description=(
        "List the internal services in the catalogue. Use this when you need to discover which "
        "services exist, or to find the exact id to pass to get_service. Do NOT use it to look up "
        "a single service you can already name - call get_service with the id instead."
    )
)
def list_services(team: str | None = None, limit: int = 20) -> dict:
    """List services, optionally filtered by owning team."""
    rows = [s for s in SERVICES if team is None or s.team == team][: max(1, min(limit, 50))]
    log("tool_call", tool="list_services", team=team, returned=len(rows))
    return {"count": len(rows), "services": [asdict(s) for s in rows]}


@server.tool(
    description=(
        "Fetch a single service by its exact id, e.g. 'ledger'. Returns the owning team and URL. "
        "If you do not know the id, call list_services first."
    )
)
def get_service(id: str) -> dict:
    """Fetch one service by exact id."""
    for s in SERVICES:
        if s.id == id:
            log("tool_call", tool="get_service", id=id, found=True)
            return asdict(s)
    known = ", ".join(s.id for s in SERVICES)
    log("tool_call", tool="get_service", id=id, found=False)
    # Return an explicit error RESULT rather than raising. A raise is caught by
    # the SDK and wrapped as "Error executing tool <name>", which sets isError on
    # some paths, truncates the detail, and loses the actionable part - the whole
    # point of the message. Building the result keeps the text intact and the
    # flag unambiguous.
    return CallToolResult(
        isError=True,
        content=[TextContent(
            type="text",
            text=f"Unknown service id {id!r}. Known ids: {known}",
        )],
    )


@server.tool(
    description=(
        "Search service ids, names and teams for a substring, case-insensitive. Use when you only "
        "remember part of a name. Returns every match, so prefer list_services for the full set."
    )
)
def search_services(query: str) -> dict:
    """Case-insensitive substring search over services."""
    q = query.lower()
    hits = [
        s for s in SERVICES
        if q in s.id.lower() or q in s.name.lower() or q in s.team.lower()
    ]
    log("tool_call", tool="search_services", query=query, hits=len(hits))
    return {"count": len(hits), "services": [asdict(s) for s in hits]}


def main() -> None:
    log("server_start", transport="stdio")
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
