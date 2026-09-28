from typing import Literal, TypedDict
from langgraph.graph import StateGraph, START, END

class TicketState(TypedDict, total=False):
    text: str
    priority: Literal["normal", "high", "invalid"]
    reply: str

def classify(s: TicketState):
    high = "caído" in s["text"].lower()
    return {"priority": "high" if high else "normal"}

def answer(s: TicketState):
    return {"reply": "Consultar la guía de soporte."}

def escalate(s: TicketState):
    return {"reply": "Derivar al equipo de incidentes."}

def classify(s: TicketState):
    text = s["text"].strip().lower()
    if not text:
        return {"priority": "invalid"}
    return {"priority": "high" if "caído" in text else "normal"}

def reject(s: TicketState):
    return {"reply": "Falta la consulta"}

builder = StateGraph(TicketState)
builder.add_node("classify", classify)
builder.add_node("answer", answer)
builder.add_node("escalate", escalate)
builder.add_edge(START, "classify")

builder.add_node("reject", reject)

def route(s: TicketState):
    return s["priority"]

builder.add_conditional_edges(
    "classify", route,
    {"normal": "answer", "high": "escalate", "invalid": "reject"},
)
builder.add_edge("answer", END)
builder.add_edge("escalate", END)
builder.add_edge("reject", END)
triage = builder.compile()

if __name__ == "__main__":
    for text in ["VPN", "Servicio caído", "  "]:
        print(triage.invoke({"text": text}, version="v2").value)
