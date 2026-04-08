from __future__ import annotations

"""
Evaluator - Orchestrator X

Runs benchmark tasks against the OrchestratorCore and produces a
scored report.  Tracks pass rate, attempt count, and wall-clock time.

Benchmark tasks live in evals/tasks/*.json.

Quick run:
    python -m src.orchestrator.evals.evaluator
"""

import json
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

_TASKS_DIR = Path(__file__).parent / "tasks"


# ---------------------------------------------------------------------------
# Task definition
# ---------------------------------------------------------------------------

@dataclass
class BenchTask:
    id: str
    prompt: str
    verify_command: str          # shell command that exits 0 on success
    description: str = ""
    timeout: int = 60            # seconds


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

@dataclass
class TaskResult:
    task_id: str
    prompt: str
    passed: bool
    attempts: int
    elapsed: float               # seconds
    error: str = ""


@dataclass
class EvalReport:
    session: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    results: list[TaskResult] = field(default_factory=list)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def pass_rate(self) -> float:
        return self.passed / self.total if self.total else 0.0

    def print_summary(self) -> None:
        print("\n" + "=" * 60)
        print(f"EVAL SESSION: {self.session}")
        print(f"Pass rate: {self.passed}/{self.total} ({self.pass_rate:.0%})")
        print("-" * 60)
        for r in self.results:
            status = "PASS" if r.passed else "FAIL"
            print(f"  [{status}] {r.task_id:30s}  {r.elapsed:.1f}s  {r.error[:60]}")
        print("=" * 60)

    def to_json(self) -> dict:
        return {
            "session": self.session,
            "pass_rate": self.pass_rate,
            "passed": self.passed,
            "total": self.total,
            "results": [
                {
                    "task_id": r.task_id,
                    "prompt": r.prompt,
                    "passed": r.passed,
                    "attempts": r.attempts,
                    "elapsed": round(r.elapsed, 2),
                    "error": r.error,
                }
                for r in self.results
            ],
        }


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

def load_tasks(tasks_dir: Path = _TASKS_DIR) -> list[BenchTask]:
    tasks: list[BenchTask] = []
    if not tasks_dir.exists():
        return tasks
    for p in sorted(tasks_dir.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            tasks.append(
                BenchTask(
                    id=data.get("id", p.stem),
                    prompt=data["prompt"],
                    verify_command=data["verify_command"],
                    description=data.get("description", ""),
                    timeout=int(data.get("timeout", 60)),
                )
            )
        except Exception as exc:
            print(f"[Eval] Skipping {p.name}: {exc}")
    return tasks


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

class Evaluator:
    def __init__(self, provider: str = "mock", max_retries: int = 1) -> None:
        self.provider = provider
        self.max_retries = max_retries

    def run(self, tasks: list[BenchTask] | None = None) -> EvalReport:
        from src.orchestrator.core import OrchestratorCore

        if tasks is None:
            tasks = load_tasks()

        if not tasks:
            print("[Eval] No benchmark tasks found. Add JSON files to evals/tasks/")
            return EvalReport()

        report = EvalReport()
        print(f"\n[Eval] Running {len(tasks)} benchmark task(s) with provider='{self.provider}'")

        for task in tasks:
            print(f"\n  > {task.id}: {task.prompt[:60]}")
            result = self._run_task(task)
            report.results.append(result)

        report.print_summary()
        return report

    def _run_task(self, task: BenchTask) -> TaskResult:
        start = time.time()
        attempts = 0
        last_error = ""

        for attempt in range(1, self.max_retries + 2):
            attempts = attempt
            try:
                from src.orchestrator.core import OrchestratorCore
                core = OrchestratorCore(provider_type=self.provider)
                core.run_prompt(task.prompt)

                passed, err = self._verify(task)
                if passed:
                    return TaskResult(
                        task_id=task.id,
                        prompt=task.prompt,
                        passed=True,
                        attempts=attempts,
                        elapsed=time.time() - start,
                    )
                last_error = err
            except Exception as exc:
                last_error = str(exc)

        return TaskResult(
            task_id=task.id,
            prompt=task.prompt,
            passed=False,
            attempts=attempts,
            elapsed=time.time() - start,
            error=last_error,
        )

    def _verify(self, task: BenchTask) -> tuple[bool, str]:
        try:
            proc = subprocess.run(
                task.verify_command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=task.timeout,
            )
            if proc.returncode == 0:
                return True, ""
            return False, (proc.stderr or proc.stdout or "exit code != 0")[:200]
        except subprocess.TimeoutExpired:
            return False, "verify timed out"
        except Exception as exc:
            return False, str(exc)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    provider = sys.argv[1] if len(sys.argv) > 1 else "mock"
    ev = Evaluator(provider=provider)
    report = ev.run()
    out = Path("eval_report.json")
    out.write_text(json.dumps(report.to_json(), indent=2), encoding="utf-8")
    print(f"\n[Eval] Report saved to {out}")
