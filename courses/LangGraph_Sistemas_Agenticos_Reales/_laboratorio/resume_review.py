import argparse
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command
from review_graph import review_builder

parser = argparse.ArgumentParser()
parser.add_argument("--db", default="checkpoints.sqlite")
parser.add_argument("--thread", required=True)
parser.add_argument("--decision", choices=["aprobar", "rechazar"], required=True)
args = parser.parse_args()
cfg = {"configurable": {"thread_id": args.thread}}
with SqliteSaver.from_conn_string(args.db) as saver:
    graph = review_builder.compile(checkpointer=saver)
    if graph.get_state(cfg).next != ("review",):
        raise SystemExit("No existe una revisión pendiente para ese thread.")
    result = graph.invoke(
        Command(resume=args.decision == "aprobar"), cfg,
        version="v2", durability="sync",
    )
    print(result.value["status"])
