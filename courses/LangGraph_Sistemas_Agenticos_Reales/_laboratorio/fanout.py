from operator import add
from typing import Annotated, TypedDict
from langgraph.types import Send
from langgraph.graph import StateGraph, START, END

class FanState(TypedDict, total=False):
    sources: list[str]
    results: Annotated[list[str], add]
    summary: str

DATA = {
    "kb": "KB-01: revisar VPN",
    "status": "ST-01: servicio operativo",
}

def dispatch(s: FanState):
    return [
        Send("search", {"source": source})
        for source in s["sources"]
    ] or "collect"

def search(job: dict):
    source = job["source"]
    text = DATA.get(source, "SIN_EVIDENCIA")
    return {"results": [f"{source}: {text}"]}

def collect(s: FanState):
    return {"summary": " / ".join(sorted(s.get("results", [])))}

fan_builder = StateGraph(FanState)
fan_builder.add_node("search", search)
fan_builder.add_node("collect", collect)
fan_builder.add_conditional_edges(START, dispatch)
fan_builder.add_edge("search", "collect")
fan_builder.add_edge("collect", END)
fanout = fan_builder.compile()


if __name__ == "__main__":
    result = fanout.invoke(
        {"sources": ["kb", "status"], "results": []},
        {"max_concurrency": 2}, version="v2",
    )
    print(result.value["summary"])
