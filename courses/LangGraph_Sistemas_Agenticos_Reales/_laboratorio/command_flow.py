from review_graph import ReviewState
from langgraph.graph import StateGraph, START, END
from typing import Literal
from langgraph.types import Command

def decide(s: ReviewState) -> Command[
    Literal["accepted", "rejected"]
]:
    target = "accepted" if s["approved"] else "rejected"
    return Command(
        update={"status": "DECIDIDO"},
        goto=target,
    )

def accepted(s):
    return {"status": "ACEPTADO"}

def rejected(s):
    return {"status": "RECHAZADO"}

builder = StateGraph(ReviewState)
builder.add_node("decide", decide)
builder.add_node("accepted", accepted)
builder.add_node("rejected", rejected)
builder.add_edge(START, "decide")
builder.add_edge("accepted", END)
builder.add_edge("rejected", END)
graph = builder.compile()

if __name__ == "__main__":
    print(graph.invoke({"approved": True}, version="v2").value)
