from operator import add
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict, total=False):
    question: str
    results: Annotated[list[str], add]
    answer: str

def kb(s: State):
    return {"results": ["KB-01: revisar red"]}

def status(s: State):
    return {"results": ["ST-01: servicio operativo"]}

def combine(s: State):
    return {"answer": " / ".join(sorted(s["results"]))}

builder = StateGraph(State)
builder.add_node("kb", kb)
builder.add_node("status", status)
builder.add_node("combine", combine)
builder.add_edge(START, "kb")
builder.add_edge(START, "status")
builder.add_edge(["kb", "status"], "combine")
builder.add_edge("combine", END)
graph = builder.compile()

if __name__ == "__main__":
    print(graph.invoke({"question": "VPN", "results": []}, version="v2").value)
