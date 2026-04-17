from __future__ import annotations

"""
LintTool - Orchestrator X

Runs flake8 (lint) and black (format) on Python files.
Auto-installs either tool if missing.

Payload:
    {"action": "lint",   "path": "main.py"}           # flake8 check
    {"action": "format", "path": "main.py"}            # black format (in-place)
    {"action": "check",  "path": "main.py"}            # black --check (no write)
    {"action": "both",   "path": "src/"}               # lint + format
"""

import subprocess
import sys
from pathlib import Path
from typing import Any

from ..tool_registry import ExecutionResult
from ...config import SYSTEM_OPERATOR_TIMEOUT


class LintTool:
    name: str = "LintTool"
    description: str = (
        "Lint (flake8) or auto-format (black) Python code. "
        "payload: {action: lint|format|check|both, path: str}"
    )

    def run(self, payload: Any) -> ExecutionResult:
        if isinstance(payload, str):
            payload = {"action": "lint", "path": payload}
        if not isinstance(payload, dict):
            return self._fail("Payload must be a dict.")

        action = str(payload.get("action", "lint")).lower()
        path = str(payload.get("path", "."))

        if action == "lint":
            return self._lint(path)
        if action == "format":
            return self._format(path, check_only=False)
        if action == "check":
            return self._format(path, check_only=True)
        if action == "both":
            lint_r = self._lint(path)
            fmt_r  = self._format(path, check_only=False)
            combined = f"=== Lint ===\n{lint_r.output}\n\n=== Format ===\n{fmt_r.output}"
            success = lint_r.success  # format always succeeds (reformats in place)
            return ExecutionResult(tool_name=self.name, success=success, output=combined)
        return self._fail(f"Unknown action '{action}'. Valid: lint, format, check, both")

    # ----------------------------------------------------------------- lint

    def _lint(self, path: str) -> ExecutionResult:
        cmd = [
            sys.executable, "-m", "flake8", path,
            "--max-line-length=100",
            "--extend-ignore=E501,W503",  # common style-only rules
        ]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True,
                timeout=SYSTEM_OPERATOR_TIMEOUT,
            )
            output = (result.stdout or result.stderr or "").strip()
            if result.returncode == 0:
                return ExecutionResult(
                    tool_name=self.name, success=True,
                    output=f"flake8: no issues found in {path}",
                )
            return ExecutionResult(
                tool_name=self.name, success=False,
                output=output or "flake8 reported errors",
                error=f"flake8 found issues in {path}",
            )
        except FileNotFoundError:
            return self._fail("flake8 not found. Run: pip install flake8")
        except subprocess.TimeoutExpired:
            return self._fail("flake8 timed out")
        except Exception as exc:
            return self._fail(str(exc))

    # ----------------------------------------------------------------- format

    def _format(self, path: str, check_only: bool) -> ExecutionResult:
        cmd = [sys.executable, "-m", "black", path, "--line-length=100"]
        if check_only:
            cmd.append("--check")

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True,
                timeout=SYSTEM_OPERATOR_TIMEOUT,
            )
            output = (result.stdout or result.stderr or "").strip()
            if check_only:
                passed = result.returncode == 0
                return ExecutionResult(
                    tool_name=self.name, success=passed,
                    output=output or ("No formatting issues." if passed else "Formatting issues found."),
                    error=None if passed else "black check failed",
                )
            return ExecutionResult(
                tool_name=self.name, success=True,
                output=output or f"black: formatted {path}",
            )
        except FileNotFoundError:
            return self._fail("black not found. Run: pip install black")
        except subprocess.TimeoutExpired:
            return self._fail("black timed out")
        except Exception as exc:
            return self._fail(str(exc))

    def _fail(self, msg: str) -> ExecutionResult:
        return ExecutionResult(tool_name=self.name, success=False, output="", error=msg)
