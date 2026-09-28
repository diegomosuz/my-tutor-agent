from typing import Literal, TypedDict
from langgraph.graph import StateGraph, START, END

class TicketState(TypedDict, total=False):
    text: str
    priority: Literal["normal", "high"]
    reply: str

from dataclasses import dataclass
from langgraph.runtime import Runtime

@dataclass(frozen=True)
class Context:
    tenant_id: str

def scoped(s: TicketState, runtime: Runtime[Context]):
    tenant = runtime.context.tenant_id
    return {"reply": f"Consulta del tenant {tenant}"}

ctx_builder = StateGraph(TicketState, context_schema=Context)

ctx_builder.add_node("scoped", scoped)
ctx_builder.add_edge(START, "scoped")
ctx_builder.add_edge("scoped", END)
ctx_graph = ctx_builder.compile()
r = ctx_graph.invoke({"text": "VPN"}, context=Context(tenant_id="acme"), version="v2")
print(r.value["reply"])
