from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.cache.memory import InMemoryCache
from langgraph.types import CachePolicy

class State(TypedDict):
    text: str
    normalized: str

calls = []
def normalize(s: State):
    calls.append(s["text"])
    return {"normalized": s["text"].strip().lower()}

builder = StateGraph(State)
builder.add_node("normalize", normalize, cache_policy=CachePolicy(ttl=60))
builder.add_edge(START, "normalize")
builder.add_edge("normalize", END)
graph = builder.compile(cache=InMemoryCache())
inputs = {"text": " VPN ", "normalized": ""}
graph.invoke(inputs, version="v2")
graph.invoke(inputs, version="v2")
assert len(calls) == 1
print("Cómputos reales:", len(calls))
