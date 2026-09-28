from langgraph.func import entrypoint, task
from langgraph.checkpoint.memory import InMemorySaver

@task
def normalize(text: str):
    return text.strip()

@entrypoint(checkpointer=InMemorySaver())
def flow(text: str):
    return normalize(text).result()

value = flow.invoke(" VPN ", {
    "configurable": {"thread_id": "functional-1"}
})
print(value)
