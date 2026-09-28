from langgraph.store.memory import InMemoryStore
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from review_graph import review_builder

store = InMemoryStore()
namespace = ("acme", "user-1", "preferences")
store.put(namespace, "language", {"value": "es"})
assert store.get(namespace, "language").value == {"value": "es"}
assert store.get(("other", "user-1", "preferences"), "language") is None

graph = review_builder.compile(checkpointer=InMemorySaver())
cfg = {"configurable": {"thread_id": "history-1"}}
graph.invoke({"ticket_id": "T1", "draft": "Revisar VPN"}, cfg, version="v2")
pending = graph.get_state(cfg)
assert pending.next == ("review",)
graph.invoke(Command(resume=False), cfg, version="v2")
for snapshot in graph.get_state_history(cfg):
    print(snapshot.next, snapshot.values)
