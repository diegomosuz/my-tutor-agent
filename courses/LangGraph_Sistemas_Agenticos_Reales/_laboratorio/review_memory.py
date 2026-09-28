from review_graph import review_builder
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

approval = review_builder.compile(checkpointer=InMemorySaver())
cfg = {"configurable": {"thread_id": "t-101"}}
pending = approval.invoke(
    {"ticket_id": "INC-101", "draft": "Revisar la VPN."},
    cfg, version="v2",
)
print(pending.interrupts[0].value)
done = approval.invoke(
    Command(resume=True), cfg, version="v2"
)
print(done.value["status"])
