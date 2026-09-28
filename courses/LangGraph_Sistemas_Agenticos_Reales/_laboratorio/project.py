from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from support import build_support
from review_graph import ReviewState, review, finalize

class CaseState(ReviewState):
    question: str
    evidence_ids: list[str]
    calls: int

def build_case(checkpointer, model_with_tools=None):
    assistant = build_support(model_with_tools)

    def generate(s: CaseState):
        result = assistant.invoke(
            {"messages": [HumanMessage(content=s["question"])], "calls": 0},
            {"recursion_limit": 12}, version="v2",
        )
        messages = result.value["messages"]
        draft = str(messages[-1].content)
        # Contrato didáctico de una KB de una sola entrada; no es un validador semántico.
        evidence = any(isinstance(m, ToolMessage) and "KB-01:" in str(m.content) for m in messages)
        usable = evidence and not draft.startswith("Límite:")
        return {"draft": draft, "calls": result.value["calls"],
                "evidence_ids": ["KB-01"] if usable else []}

    def route(s: CaseState):
        return "review" if s["evidence_ids"] else "handoff"

    def handoff(s: CaseState):
        return {"status": "DERIVADO", "approved": False}

    builder = StateGraph(CaseState)
    builder.add_node("generate", generate)
    builder.add_node("review", review)
    builder.add_node("finalize", finalize)
    builder.add_node("handoff", handoff)
    builder.add_edge(START, "generate")
    builder.add_conditional_edges("generate", route, {"review": "review", "handoff": "handoff"})
    builder.add_edge("review", "finalize")
    builder.add_edge("finalize", END)
    builder.add_edge("handoff", END)
    return builder.compile(checkpointer=checkpointer)

if __name__ == "__main__":
    graph = build_case(InMemorySaver())
    cfg = {"configurable": {"thread_id": "case-1"}}
    pending = graph.invoke({"ticket_id": "T1", "question": "Ayuda con VPN"}, cfg, version="v2")
    print("Pendiente:", pending.interrupts[0].value)
    done = graph.invoke(Command(resume=True), cfg, version="v2")
    print("Final:", done.value["status"])
