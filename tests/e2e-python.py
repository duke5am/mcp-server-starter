import asyncio, json, sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(
        command="/root/mcpscratch/.venv-mcp/bin/python",
        args=[__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__))), "python", "server.py")],
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as s:
            await s.initialize()
            tools = await s.list_tools()
            print("tools:", ", ".join(t.name for t in tools.tools))
            for name, args in [("list_services", {}), ("list_services", {"team":"payments"}),
                               ("get_service", {"id":"ledger"}), ("search_services", {"query":"SEARCH"}),
                               ("get_service", {"id":"nope"})]:
                r = await s.call_tool(name, args)
                txt = " | ".join(c.text for c in r.content if getattr(c, "text", None))
                print(f"  {name}({json.dumps(args)}) isError={bool(getattr(r,"is_error",getattr(r,"isError",False)))}")
                print(f"     -> {txt[:105]}")

asyncio.run(main())
