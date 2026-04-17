from __future__ import annotations

"""
SwarmManager - Orchestrator X

Runs independent tasks in parallel using a thread pool.
Tasks with `depends_on` entries (or explicit `parallel: false`) are
excluded from swarm execution and returned to the caller for sequential
handling.

Usage:
    sm = SwarmManager(executor)
    parallel_tasks, sequential_tasks = sm.partition(plan)
    results = sm.run_parallel(parallel_tasks)   # all at once
    # then run sequential_tasks one by one
"""

import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Callable

from ..execution.tool_registry import ExecutionResult
from ..execution.executor import RuntimeExecutor


@dataclass
class SwarmResult:
    task: dict
    result: ExecutionResult
    thread_name: str


@dataclass
class SwarmReport:
    results: list[SwarmResult] = field(default_factory=list)
    succeeded: list[dict] = field(default_factory=list)
    failed: list[dict] = field(default_factory=list)

    def all_succeeded(self) -> bool:
        return len(self.failed) == 0

    def summary(self) -> str:
        return (
            f"Swarm: {len(self.succeeded)} succeeded, "
            f"{len(self.failed)} failed out of {len(self.results)} tasks."
        )


class SwarmManager:
    """
    Parallel agent execution engine.

    Workers share the same RuntimeExecutor (which is thread-safe as long
    as individual tools are - FileEngine and SystemOperator both acquire
    no shared locks so this is safe).
    """

    def __init__(
        self,
        executor: RuntimeExecutor,
        max_workers: int = 4,
        on_event: Callable[[str, str], None] | None = None,
    ) -> None:
        self.executor = executor
        self.max_workers = max_workers
        self._on_event = on_event or (lambda kind, msg: print(f"[Swarm/{kind}] {msg}"))
        self._lock = threading.Lock()

    # ----------------------------------------------------------------- public

    def partition(self, plan: list[dict]) -> tuple[list[dict], list[dict]]:
        """
        Split a plan into (parallelisable, sequential) task lists.

        A task is safe to parallelise when:
          - it has no `depends_on` entries
          - it does not set `parallel: false`
          - it is NOT a DeployAgent call (deployment must be last)
          - it does NOT run (SystemOperator) a file that another task writes
            in the same plan (auto dependency inference)
        """
        # Collect all files written in this plan
        written_files: set[str] = set()
        for task in plan:
            if task.get("tool") == "FileEngine":
                payload = task.get("payload", {})
                if isinstance(payload, dict) and payload.get("action") in ("write", "edit"):
                    path = payload.get("path", "")
                    if path:
                        written_files.add(path)

        parallel: list[dict] = []
        sequential: list[dict] = []

        for task in plan:
            has_deps = bool(task.get("depends_on"))
            forced_seq = task.get("parallel") is False
            is_deploy = task.get("tool") == "DeployAgent"

            # Auto-detect: SystemOperator running a file that's being written
            runs_written_file = False
            if task.get("tool") == "SystemOperator":
                payload = task.get("payload", {})
                cmd = str(payload.get("command", "") if isinstance(payload, dict) else payload)
                for wf in written_files:
                    if wf in cmd:
                        runs_written_file = True
                        break

            if has_deps or forced_seq or is_deploy or runs_written_file:
                sequential.append(task)
            else:
                parallel.append(task)

        return parallel, sequential

    def run_parallel(self, tasks: list[dict]) -> SwarmReport:
        """Execute all tasks simultaneously; collect results."""
        if not tasks:
            return SwarmReport()

        report = SwarmReport()

        self._on_event(
            "info",
            f"Launching {len(tasks)} task(s) in parallel with {self.max_workers} workers.",
        )

        with ThreadPoolExecutor(max_workers=min(self.max_workers, len(tasks))) as pool:
            future_to_task = {
                pool.submit(self._run_one, task): task for task in tasks
            }
            for future in as_completed(future_to_task):
                task = future_to_task[future]
                try:
                    swarm_result = future.result()
                    report.results.append(swarm_result)
                    if swarm_result.result.success:
                        report.succeeded.append(task)
                        self._on_event(
                            "success",
                            f"[{swarm_result.thread_name}] {task.get('description', '?')} - OK",
                        )
                    else:
                        report.failed.append(task)
                        self._on_event(
                            "fail",
                            f"[{swarm_result.thread_name}] {task.get('description', '?')} "
                            f"- FAILED: {swarm_result.result.error}",
                        )
                except Exception as exc:  # noqa: BLE001
                    report.failed.append(task)
                    self._on_event(
                        "error",
                        f"{task.get('description', '?')} raised exception: {exc}",
                    )

        self._on_event("info", report.summary())
        return report

    # ---------------------------------------------------------------- private

    def _run_one(self, task: dict) -> SwarmResult:
        tname = threading.current_thread().name
        self._on_event("start", f"[{tname}] {task.get('description', '?')}")
        result = self.executor.perform(task["tool"], task["payload"])
        return SwarmResult(task=task, result=result, thread_name=tname)
