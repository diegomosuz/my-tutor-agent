from typing import TypedDict
from langgraph.types import interrupt, Command

class ReviewState(TypedDict, total=False):
    ticket_id: str
    draft: str
    approved: bool
    status: str

def review(s: ReviewState):
    decision = interrupt({
        "ticket_id": s["ticket_id"], "draft": s["draft"]
    })
    if not isinstance(decision, bool):
        raise ValueError("La decisión debe ser booleana")
    return {"approved": decision}

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

def finalize(s: ReviewState):
    status = "SIMULADO" if s["approved"] else "RECHAZADO"
    return {"status": status}

review_builder = StateGraph(ReviewState)
review_builder.add_node("review", review)
review_builder.add_node("finalize", finalize)
review_builder.add_edge(START, "review")
review_builder.add_edge("review", "finalize")
review_builder.add_edge("finalize", END)
