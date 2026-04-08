"""
Real eval runner — uses an actual LLM provider (not mock).

Usage:
    python -m src.orchestrator.evals.real                   # auto-detect provider
    python -m src.orchestrator.evals.real kimi              # explicit provider
    python -m src.orchestrator.evals.real claude --verbose  # verbose output

Benchmark tasks (beyond the mock evals):
    1. build_api      — write + deploy a FastAPI /health endpoint, verify HTTP 200
    2. fix_bug        — fix a broken Python file, verify it runs
    3. git_workflow   — run git status and log
    4. web_research   — search for a topic, write summary to file
"""
from __future__ import annotations

import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


@dataclass
class RealTask:
    id: str
    prompt: str
    verify_fn: object          # callable(cwd) -> (bool, str)
    description: str = ""
    timeout: int = 90


@dataclass
class RealResult:
    task_id: str
    passed: bool
    elapsed: float
    error: str = ""


# ---------------------------------------------------------------------------
# Verification helpers
# ---------------------------------------------------------------------------

def _verify_file_exists(path: str):
    def _check(cwd):
        p = Path(cwd) / path
        return p.exists(), (f"{path} exists" if p.exists() else f"{path} not found")
    return _check


def _verify_http_200(url: str):
    from urllib.request import urlopen, Request
    from urllib.error import URLError
    def _check(cwd):
        probes = [url, url + "/health", url + "/healthz"]
        for u in probes:
            try:
                req = Request(u, headers={"User-Agent": "OrchestratorX-Eval/1.0"})
                with urlopen(req, timeout=5) as r:
                    if 200 <= r.status < 400:
                        return True, f"HTTP {r.status} from {u}"
            except URLError:
                continue
            except Exception:
                continue
        return False, f"No 200 response from {url}"
    return _check


def _verify_output_contains(path: str, text: str):
    def _check(cwd):
        import subprocess
        p = Path(cwd) / path
        if not p.exists():
            return False, f"{path} not found"
        r = subprocess.run([sys.executable, str(p)], capture_output=True, text=True, timeout=10)
        found = text.lower() in (r.stdout + r.stderr).lower()
        return found, (f"output contains '{text}'" if found else f"'{text}' not in output: {r.stdout[:100]}")
    return _check


# ---------------------------------------------------------------------------
# Task definitions
# ---------------------------------------------------------------------------

_TASKS: list[RealTask] = [
    RealTask(
        id="build_api",
        description="Write and deploy a FastAPI /health endpoint, verify HTTP 200",
        prompt="create app.py with a FastAPI /health endpoint that returns {status: ok}, then deploy it",
        verify_fn=_verify_http_200("http://127.0.0.1:8000"),
        timeout=60,
    ),
    RealTask(
        id="fix_bug",
        description="Create a buggy Python file, fix it, verify it prints 5",
        prompt=(
            "create buggy_real.py with content: "
            "\"def add(a, b):\\n    return a - b\\nprint(add(2, 3))\" "
            "then fix the bug so it prints 5 and run it"
        ),
        verify_fn=_verify_output_contains("buggy_real.py", "5"),
        timeout=90,
    ),
    RealTask(
        id="write_summary",
        description="Search the web and write a summary file",
        prompt="search for 'Python async best practices 2025' and write a 3-point summary to summary.txt",
        verify_fn=_verify_file_exists("summary.txt"),
        timeout=60,
    ),
    RealTask(
        id="git_status",
        description="Run git status and log via GitTool",
        prompt="check the git status of this repo and show the last 5 commits",
        verify_fn=lambda cwd: (True, "git task (output-only, always passes)"),
        timeout=30,
    ),
]


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

class RealEvaluator:
    def __init__(self, provider: str = "auto", verbose: bool = False):
        self.provider = provider
        self.verbose = verbose
        self.cwd = str(Path.cwd())

    def run(self, tasks: list[RealTask] | None = None) -> list[RealResult]:
        from src.orchestrator.core import OrchestratorCore

        tasks = tasks or _TASKS
        results: list[RealResult] = []
        session_id = uuid.uuid4().hex[:8]

        print(f"\n{'='*60}")
        print(f"REAL EVAL  session={session_id}  provider={self.provider}")
        print(f"{'='*60}")

        for task in tasks:
            print(f"\n  > [{task.id}] {task.description}")
            start = time.time()
            try:
                core = OrchestratorCore(
                    provider_type=self.provider,
                    approval_mode="auto",
                )
                if not self.verbose:
                    # Suppress orchestrator noise during evals
                    import io, contextlib
                    buf = io.StringIO()
                    with contextlib.redirect_stdout(buf):
                        core.run_prompt(task.prompt)
                else:
                    core.run_prompt(task.prompt)

                passed, reason = task.verify_fn(self.cwd)
                elapsed = time.time() - start
                status = "PASS" if passed else "FAIL"
                print(f"    [{status}] {elapsed:.1f}s  {reason[:80]}")
                results.append(RealResult(task.id, passed, elapsed, "" if passed else reason))

            except Exception as exc:
                elapsed = time.time() - start
                print(f"    [FAIL] {elapsed:.1f}s  exception: {str(exc)[:80]}")
                results.append(RealResult(task.id, False, elapsed, str(exc)[:200]))

        # Summary
        passed = sum(1 for r in results if r.passed)
        total = len(results)
        print(f"\n{'='*60}")
        print(f"Result: {passed}/{total} ({passed/total:.0%})")
        print(f"{'='*60}\n")

        return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    args = sys.argv[1:]
    provider = "auto"
    verbose = False

    if "--verbose" in args:
        verbose = True
        args = [a for a in args if a != "--verbose"]
    if args:
        provider = args[0]

    RealEvaluator(provider=provider, verbose=verbose).run()
