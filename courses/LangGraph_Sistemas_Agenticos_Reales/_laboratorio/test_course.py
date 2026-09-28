"""Pruebas del control de ejecución. No realizan llamadas a un proveedor LLM."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph.message import add_messages
from langgraph.types import Command
from support import build_support
from review_graph import review_builder
from project import build_case

LAB = Path(__file__).parent

class ForbiddenModel:
    def invoke(self, messages):
        raise AssertionError("Llamada indebida al modelo")

class LoopModel:
    def __init__(self):
        self.count = 0
    def invoke(self, messages):
        self.count += 1
        return AIMessage(content="", tool_calls=[{
            "name": "lookup", "args": {"query": "vpn"},
            "id": f"c{self.count}", "type": "tool_call",
        }])

class CourseTests(unittest.TestCase):
    def cfg(self, name="test"):
        return {"configurable": {"thread_id": name}}

    def run_script(self, script, *args, cwd=None):
        p = subprocess.run([sys.executable, str(LAB/script), *args],
                           cwd=cwd or LAB, text=True, capture_output=True, timeout=30)
        self.assertEqual(p.returncode, 0, p.stderr)
        return p.stdout

    def test_triage_routes(self):
        from triage_validado import triage
        for text, priority in [("VPN", "normal"), ("Servicio caído", "high"), ("  ", "invalid")]:
            with self.subTest(text=text):
                self.assertEqual(triage.invoke({"text": text}, version="v2").value["priority"], priority)

    def test_message_identity(self):
        merged = add_messages([AIMessage(content="A", id="m1")], [AIMessage(content="B", id="m1")])
        self.assertEqual((len(merged), merged[0].content), (1, "B"))

    def test_agent_protocol(self):
        out = build_support().invoke({"messages": [HumanMessage(content="VPN")], "calls": 0}, version="v2").value
        self.assertEqual([m.type for m in out["messages"]], ["human", "ai", "tool", "ai"])
        call = out["messages"][1].tool_calls[0]
        result = out["messages"][2]
        self.assertIsInstance(result, ToolMessage)
        self.assertEqual(call["id"], result.tool_call_id)
        self.assertIn("KB-01", result.content)
        self.assertEqual(out["calls"], 2)

    def test_no_evidence(self):
        out = build_support().invoke({"messages": [HumanMessage(content="Impresora")], "calls": 0}, version="v2").value
        self.assertEqual(out["messages"][-1].content, "Sin evidencia: derivar.")

    def test_budget_before_model(self):
        out = build_support(ForbiddenModel()).invoke({"messages": [HumanMessage(content="VPN")], "calls": 3}, version="v2").value
        self.assertEqual(out["calls"], 3)
        self.assertTrue(out["messages"][-1].content.startswith("Límite:"))

    def test_repeated_tool_requests_stop(self):
        model = LoopModel()
        out = build_support(model).invoke({"messages": [HumanMessage(content="VPN")], "calls": 0}, {"recursion_limit": 12}, version="v2").value
        self.assertEqual(model.count, 3)
        self.assertEqual(out["calls"], 3)
        self.assertTrue(out["messages"][-1].content.startswith("Límite:"))

    def test_approve(self):
        graph = review_builder.compile(checkpointer=InMemorySaver())
        first = graph.invoke({"ticket_id": "T", "draft": "D"}, self.cfg(), version="v2")
        self.assertTrue(first.interrupts)
        self.assertEqual(graph.get_state(self.cfg()).next, ("review",))
        done = graph.invoke(Command(resume=True), self.cfg(), version="v2")
        self.assertEqual(done.value["status"], "SIMULADO")

    def test_reject(self):
        graph = review_builder.compile(checkpointer=InMemorySaver())
        graph.invoke({"ticket_id": "T", "draft": "D"}, self.cfg(), version="v2")
        done = graph.invoke(Command(resume=False), self.cfg(), version="v2")
        self.assertEqual(done.value["status"], "RECHAZADO")

    def test_bad_decision_type(self):
        graph = review_builder.compile(checkpointer=InMemorySaver())
        graph.invoke({"ticket_id": "T", "draft": "D"}, self.cfg(), version="v2")
        with self.assertRaises(ValueError):
            graph.invoke(Command(resume="false"), self.cfg(), version="v2")

    def test_threads_are_independent(self):
        graph = review_builder.compile(checkpointer=InMemorySaver())
        for name in ["A", "B"]:
            graph.invoke({"ticket_id": name, "draft": "Draft-"+name}, self.cfg(name), version="v2")
        graph.invoke(Command(resume=True), self.cfg("A"), version="v2")
        self.assertEqual(graph.get_state(self.cfg("B")).next, ("review",))
        self.assertEqual(graph.get_state(self.cfg("B")).values["draft"], "Draft-B")

    def test_sqlite_across_processes(self):
        with tempfile.TemporaryDirectory() as d:
            db = str(Path(d)/"review.sqlite")
            self.assertIn("INC-202", self.run_script("start_review.py", "--db", db, "--thread", "disk", cwd=d))
            self.assertIn("SIMULADO", self.run_script("resume_review.py", "--db", db, "--thread", "disk", "--decision", "aprobar", cwd=d))

    def test_static_parallel(self):
        from parallel import graph
        out = graph.invoke({"question": "VPN", "results": []}, version="v2").value
        self.assertEqual(len(out["results"]), 2)
        self.assertIn("KB-01", out["answer"])
        self.assertIn("ST-01", out["answer"])

    def test_send_edge_cases(self):
        from fanout import fanout
        for sources, count in [([], 0), (["kb"], 1), (["kb", "kb"], 2), (["kb", "status", "unknown"], 3)]:
            with self.subTest(sources=sources):
                out = fanout.invoke({"sources": sources, "results": []}, version="v2").value
                self.assertEqual(len(out["results"]), count)
                self.assertEqual(out["summary"], " / ".join(sorted(out["results"])))

    def test_command_routes(self):
        from command_flow import graph
        for flag, status in [(True, "ACEPTADO"), (False, "RECHAZADO")]:
            self.assertEqual(graph.invoke({"approved": flag}, version="v2").value["status"], status)

    def test_subgraph_mapping(self):
        from subgraph import parent
        out = parent.invoke({"text": "VPN"}, version="v2").value
        self.assertEqual(out["draft"], "KB-01")
        self.assertNotIn("query", out)

    def test_functional_value(self):
        self.assertEqual(self.run_script("functional.py").strip(), "VPN")

    def test_context(self):
        self.assertIn("tenant acme", self.run_script("contexto.py"))

    def test_retry(self):
        self.assertIn("Intentos: 2", self.run_script("retry_demo.py"))

    def test_cache(self):
        self.assertIn("Cómputos reales: 1", self.run_script("cache_demo.py"))

    def test_stream_shape(self):
        chunks = list(build_support().stream({"messages": [HumanMessage(content="VPN")], "calls": 0}, stream_mode="updates", version="v2"))
        self.assertTrue(chunks)
        self.assertTrue(all(set(["type", "ns", "data"]) <= c.keys() for c in chunks))
        self.assertTrue(all(c["type"] == "updates" for c in chunks))

    def test_async_stream(self):
        self.assertIn("async updates", self.run_script("stream_demo.py"))

    def test_store_and_history(self):
        self.assertIn("RECHAZADO", self.run_script("store_history.py"))

    def test_project_approval_and_rejection(self):
        for flag, expected in [(True, "SIMULADO"), (False, "RECHAZADO")]:
            graph = build_case(InMemorySaver())
            first = graph.invoke({"ticket_id": "T", "question": "VPN"}, self.cfg(), version="v2")
            self.assertTrue(first.interrupts)
            self.assertEqual(first.value["evidence_ids"], ["KB-01"])
            done = graph.invoke(Command(resume=flag), self.cfg(), version="v2")
            self.assertEqual(done.value["status"], expected)

    def test_project_missing_evidence(self):
        graph = build_case(InMemorySaver())
        out = graph.invoke({"ticket_id": "T", "question": "Impresora"}, self.cfg(), version="v2")
        self.assertFalse(out.interrupts)
        self.assertEqual(out.value["status"], "DERIVADO")

    def test_project_budget_exhaustion(self):
        graph = build_case(InMemorySaver(), LoopModel())
        out = graph.invoke({"ticket_id": "T", "question": "VPN"}, self.cfg(), version="v2")
        self.assertFalse(out.interrupts)
        self.assertEqual(out.value["status"], "DERIVADO")
        self.assertEqual(out.value["calls"], 3)

    def test_project_disk(self):
        with tempfile.TemporaryDirectory() as d:
            db = str(Path(d)/"project.sqlite")
            self.assertIn("PENDIENTE", self.run_script("project_disk.py", "start", "--db", db, "--thread", "final", cwd=d))
            self.assertIn("RECHAZADO", self.run_script("project_disk.py", "resume", "--db", db, "--thread", "final", "--decision", "rechazar", cwd=d))

if __name__ == "__main__":
    unittest.main()
