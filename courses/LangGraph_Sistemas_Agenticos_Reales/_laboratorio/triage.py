from typing import Literal, TypedDict
from langgraph.graph import StateGraph, START, END

class TicketState(TypedDict, total=False):
    text: str
    priority: Literal["normal", "high"]
    reply: str

def classify(s: TicketState):
    high = "caído" in s["text"].lower()
    return {"priority": "high" if high else "normal"}

def answer(s: TicketState):
    return {"reply": "Consultar la guía de soporte."}

def escalate(s: TicketState):
    return {"reply": "Derivar al equipo de incidentes."}

builder = StateGraph(TicketState)
builder.add_node("classify", classify)
builder.add_node("answer", answer)
builder.add_node("escalate", escalate)
builder.add_edge(START, "classify")

def route(s: TicketState):
    return s["priority"]

builder.add_conditional_edges(
    "classify", route,
    {"normal": "answer", "high": "escalate"},
)
builder.add_edge("answer", END)
builder.add_edge("escalate", END)
triage = builder.compile()

if __name__ == "__main__":
    result = triage.invoke(
        {"text": "Servicio caído"},
        version="v2",
    )
    print(result.value["priority"])
    print(result.value["reply"])
    assert result.value["priority"] == "high"
