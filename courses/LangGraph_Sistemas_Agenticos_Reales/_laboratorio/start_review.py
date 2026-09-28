import argparse
from langgraph.checkpoint.sqlite import SqliteSaver
from review_graph import review_builder

parser = argparse.ArgumentParser()
parser.add_argument("--db", default="checkpoints.sqlite")
parser.add_argument("--thread", required=True)
args = parser.parse_args()
cfg = {"configurable": {"thread_id": args.thread}}
with SqliteSaver.from_conn_string(args.db) as saver:
    graph = review_builder.compile(checkpointer=saver)
    if graph.get_state(cfg).values:
        raise SystemExit("El thread ya existe. Reanudalo o elegí otro.")
    pending = graph.invoke(
        {"ticket_id": "INC-202", "draft": "Revisar la VPN."},
        cfg, version="v2", durability="sync",
    )
    print(pending.interrupts[0].value)
