from langchain_core.tools import tool

KB = {"vpn": "KB-01: verificar red y credenciales."}

@tool
def lookup(query: str) -> str:
    """Busca instrucciones verificadas de soporte."""
    key = query.strip().lower()
    matches = [v for k, v in KB.items() if k in key]
    return "\n".join(matches) or "SIN_EVIDENCIA"

from langgraph.graph import MessagesState, StateGraph, START
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

class AgentState(MessagesState):
    calls: int

SYSTEM = "Consultá lookup. Sin evidencia, indicá la limitación."


class OfflineModel:
    def invoke(self, messages):
        last = messages[-1]
        if isinstance(last, ToolMessage):
            if "SIN_EVIDENCIA" in str(last.content):
                return AIMessage(content="Sin evidencia: derivar.")
            return AIMessage(content=f"Según {last.content}")
        return AIMessage(
            content="",
            tool_calls=[{
                "name": "lookup",
                "args": {"query": str(last.content)},
                "id": "c1",
                "type": "tool_call",
            }],
        )


def build_support(model_with_tools=None):
    # Inyectamos un modelo ya configurado; por defecto usamos el simulador.
    if model_with_tools is None:
        model_with_tools = OfflineModel()

    def agent(s: AgentState):
        if s["calls"] >= 3:
            return {"messages": [AIMessage(content="Límite: derivar a una persona.")]}
        reply = model_with_tools.invoke([SystemMessage(content=SYSTEM), *s["messages"]])
        return {"messages": [reply], "calls": s["calls"] + 1}

    builder = StateGraph(AgentState)
    builder.add_node("agent", agent)
    builder.add_node("tools", ToolNode([lookup]))
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", tools_condition)
    builder.add_edge("tools", "agent")
    return builder.compile()

support = build_support()


if __name__ == "__main__":
    from langchain_core.messages import HumanMessage

    inputs = {
        "messages": [HumanMessage(content="¿Cómo reviso la VPN?")],
        "calls": 0,
    }
    result = support.invoke(
        inputs, {"recursion_limit": 12}, version="v2"
    )
    for message in result.value["messages"]:
        print(message.type, message.content)
    print("Llamadas:", result.value["calls"])
