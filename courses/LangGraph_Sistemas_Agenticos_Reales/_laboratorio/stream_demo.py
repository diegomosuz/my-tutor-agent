import asyncio
from langchain_core.messages import HumanMessage
from support import support

inputs = {"messages": [HumanMessage(content="VPN")], "calls": 0}
for part in support.stream(inputs, stream_mode="updates", version="v2"):
    print(part["type"], list(part["data"]))

async def main():
    async for part in support.astream(inputs, stream_mode="updates", version="v2"):
        print("async", part["type"], list(part["data"]))

if __name__ == "__main__":
    asyncio.run(main())
