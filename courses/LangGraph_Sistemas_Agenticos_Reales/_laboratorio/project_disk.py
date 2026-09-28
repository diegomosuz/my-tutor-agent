import argparse
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command
from project import build_case

parser = argparse.ArgumentParser()
parser.add_argument("action", choices=["start", "resume"])
parser.add_argument("--db", default="project.sqlite")
parser.add_argument("--thread", required=True)
parser.add_argument("--question", default="Ayuda con VPN")
parser.add_argument("--decision", choices=["aprobar", "rechazar"], default="rechazar")
args = parser.parse_args()
cfg = {"configurable": {"thread_id": args.thread}}
with SqliteSaver.from_conn_string(args.db) as saver:
    graph = build_case(saver)
    snapshot = graph.get_state(cfg)
    if args.action == "start":
        if snapshot.values:
            raise SystemExit("El caso ya existe. Usá resume o un thread nuevo.")
        payload = {"ticket_id": args.thread, "question": args.question}
    else:
        if snapshot.next != ("review",):
            raise SystemExit("El caso no tiene una revisión pendiente.")
        payload = Command(resume=args.decision == "aprobar")
    result = graph.invoke(payload, cfg, version="v2", durability="sync")
    if result.interrupts:
        print("PENDIENTE", result.interrupts[0].value)
    else:
        print(result.value["status"])
