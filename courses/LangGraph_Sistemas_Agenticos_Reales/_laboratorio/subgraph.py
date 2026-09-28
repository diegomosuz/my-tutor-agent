from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class ChildState(TypedDict, total=False):
    query: str
    answer: str

class ParentState(TypedDict, total=False):
    text: str
    draft: str

def search(s: ChildState):
    return {"answer": "KB-01" if "vpn" in s["query"].lower() else "SIN_EVIDENCIA"}

child_builder = StateGraph(ChildState)
child_builder.add_node("search", search)
child_builder.add_edge(START, "search")
child_builder.add_edge("search", END)
child = child_builder.compile()

def adapt(s: ParentState):
    result = child.invoke({"query": s["text"]}, version="v2")
    return {"draft": result.value["answer"]}

parent_builder = StateGraph(ParentState)
parent_builder.add_node("research", adapt)
parent_builder.add_edge(START, "research")
parent_builder.add_edge("research", END)
parent = parent_builder.compile()

if __name__ == "__main__":
    print(parent.invoke({"text": "VPN"}, version="v2").value)
