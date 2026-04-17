from __future__ import annotations

"""
TestTool - Orchestrator X

Runs pytest and can auto-generate a basic test stub for a Python file.

Payload:
    {"action": "run",      "path": "tests/test_api.py", "verbose": true}
    {"action": "run",      "path": ".",  "pattern": "test_*.py"}
    {"action": "generate", "source": "main.py", "output": "test_main.py"}
    {"action": "coverage", "path": "src/"}
"""

import ast
import subprocess
import sys
from pathlib import Path
from typing import Any

from ..tool_registry import ExecutionResult
from ...config import SYSTEM_OPERATOR_TIMEOUT


class TestTool:
    name: str = "TestTool"
    description: str = (
        "Run pytest tests or auto-generate a test stub. "
        "payload: {action: run|generate|coverage, path?, source?, output?, verbose?, pattern?}"
    )

    def run(self, payload: Any) -> ExecutionResult:
        if isinstance(payload, str):
            payload = {"action": "run", "path": payload}
        if not isinstance(payload, dict):
            return self._fail("Payload must be a dict.")

        action = str(payload.get("action", "run")).lower()
        cwd = payload.get("cwd") or None

        if action == "run":
            return self._run_tests(payload, cwd)
        if action == "generate":
            return self._generate_stub(payload)
        if action == "coverage":
            return self._run_coverage(payload, cwd)
        return self._fail(f"Unknown action '{action}'. Valid: run, generate, coverage")

    # ----------------------------------------------------------------- run

    def _run_tests(self, payload: dict, cwd: str | None) -> ExecutionResult:
        path = str(payload.get("path", "."))
        verbose = payload.get("verbose", True)
        pattern = payload.get("pattern", "")

        cmd = [sys.executable, "-m", "pytest", path, "--tb=short", "--no-header", "-q"]
        if verbose:
            cmd.append("-v")
        if pattern:
            cmd.extend(["--collect-only", "-q"])  # just used for pattern hint

        try:
            result = subprocess.run(
                cmd, cwd=cwd, capture_output=True, text=True,
                timeout=SYSTEM_OPERATOR_TIMEOUT,
            )
            output = "\n".join(filter(None, [result.stdout.strip(), result.stderr.strip()]))
            passed = result.returncode == 0
            return ExecutionResult(
                tool_name=self.name,
                success=passed,
                output=output or "(no output)",
                error=None if passed else f"pytest exit code {result.returncode}",
            )
        except FileNotFoundError:
            return self._fail("pytest not found. Run: pip install pytest")
        except subprocess.TimeoutExpired:
            return self._fail(f"Tests timed out after {SYSTEM_OPERATOR_TIMEOUT}s")
        except Exception as exc:
            return self._fail(str(exc))

    # ----------------------------------------------------------------- generate

    def _generate_stub(self, payload: dict) -> ExecutionResult:
        source = str(payload.get("source", ""))
        output = payload.get("output") or f"test_{Path(source).stem}.py"

        if not source or not Path(source).exists():
            return self._fail(f"Source file not found: {source}")

        try:
            src_text = Path(source).read_text(encoding="utf-8")
            tree = ast.parse(src_text)
        except Exception as exc:
            return self._fail(f"Cannot parse {source}: {exc}")

        functions = [
            node.name for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and not node.name.startswith("_")
        ]
        classes = [
            node.name for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef)
        ]

        module_name = Path(source).stem
        lines = [
            f'"""Auto-generated test stub for {source}."""',
            "import pytest",
            f"from {module_name} import *  # noqa: F401, F403",
            "",
        ]

        for cls in classes:
            lines += [
                f"",
                f"class Test{cls}:",
                f"    def test_{cls.lower()}_exists(self):",
                f"        assert {cls} is not None",
                f"",
            ]

        for fn in functions:
            lines += [
                f"",
                f"def test_{fn}():",
                f'    """Test {fn}."""',
                f"    # TODO: implement test for {fn}",
                f"    pass",
                f"",
            ]

        if not functions and not classes:
            lines += ["", "def test_placeholder():", "    pass", ""]

        stub = "\n".join(lines)
        try:
            Path(output).write_text(stub, encoding="utf-8")
            return ExecutionResult(
                tool_name=self.name, success=True,
                output=f"Test stub written to {output} ({len(functions)} functions, {len(classes)} classes)",
            )
        except Exception as exc:
            return self._fail(f"Cannot write {output}: {exc}")

    # ----------------------------------------------------------------- coverage

    def _run_coverage(self, payload: dict, cwd: str | None) -> ExecutionResult:
        path = str(payload.get("path", "."))
        cmd = [
            sys.executable, "-m", "pytest",
            f"--cov={path}", "--cov-report=term-missing", "--no-header", "-q",
        ]
        try:
            result = subprocess.run(
                cmd, cwd=cwd, capture_output=True, text=True,
                timeout=SYSTEM_OPERATOR_TIMEOUT,
            )
            output = "\n".join(filter(None, [result.stdout.strip(), result.stderr.strip()]))
            return ExecutionResult(
                tool_name=self.name,
                success=result.returncode == 0,
                output=output or "(no output)",
            )
        except FileNotFoundError:
            return self._fail("pytest-cov not found. Run: pip install pytest-cov")
        except subprocess.TimeoutExpired:
            return self._fail("Coverage run timed out")
        except Exception as exc:
            return self._fail(str(exc))

    def _fail(self, msg: str) -> ExecutionResult:
        return ExecutionResult(tool_name=self.name, success=False, output="", error=msg)
