from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import RetryPolicy
class RState(TypedDict):
    ok: bool
attempts = 0
def fetch(s):
    global attempts
    attempts += 1
    if attempts < 2:
        raise TimeoutError("fallo transitorio simulado")
    return {"ok": True}
builder = StateGraph(RState)
builder.add_node("fetch", fetch, retry_policy=RetryPolicy(max_attempts=3, retry_on=TimeoutError, initial_interval=0.01))
builder.add_edge(START, "fetch")
builder.add_edge("fetch", END)
r = builder.compile().invoke({"ok": False}, version="v2")
assert r.value["ok"] and attempts == 2
print("Intentos:", attempts)
