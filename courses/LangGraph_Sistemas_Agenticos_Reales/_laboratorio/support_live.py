import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from support import build_support, lookup


def configured_model():
    return ChatOpenAI(
        model=os.environ["MODEL_NAME"],
        temperature=0, timeout=20, max_retries=1,
    )


if __name__ == "__main__":
    graph = build_support(configured_model().bind_tools([lookup]))
    result = graph.invoke(
        {"messages": [HumanMessage(content="Ayuda con VPN")], "calls": 0},
        {"recursion_limit": 12}, version="v2",
    )
    for message in result.value["messages"]:
        print(message.type, message.content)
