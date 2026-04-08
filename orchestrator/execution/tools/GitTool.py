from __future__ import annotations

"""
GitTool - Orchestrator X

Exposes git operations as a first-class tool so the agent can inspect,
stage, commit, and diff code as part of any automated workflow.

Payload format:
    {"action": "status"}
    {"action": "diff",   "staged": true}
    {"action": "log",    "n": 10}
    {"action": "add",    "files": ["src/main.py", "README.md"]}  # or "." for all
    {"action": "commit", "message": "feat: add login endpoint"}
    {"action": "branch"}
    {"action": "show",   "ref": "HEAD"}
"""

import subprocess
from pathlib import Path
from typing import Any

from ..tool_registry import ExecutionResult
from ...config import GIT_TOOL_TIMEOUT


class GitTool:
    name: str = "GitTool"
    description: str = (
        "Run git commands: status, diff, log, add, commit, branch, show. "
        "payload: {action, files?, message?, n?, staged?, ref?, cwd?}"
    )

    def run(self, payload: Any) -> ExecutionResult:
        if not isinstance(payload, dict):
            return self._fail("Payload must be a dict with 'action' key.")

        action = str(payload.get("action", "")).lower().strip()
        cwd = payload.get("cwd") or None

        dispatch = {
            "status":  self._status,
            "diff":    self._diff,
            "log":     self._log,
            "add":     self._add,
            "commit":  self._commit,
            "branch":  self._branch,
            "show":    self._show,
        }

        handler = dispatch.get(action)
        if not handler:
            valid = ", ".join(dispatch.keys())
            return self._fail(f"Unknown action '{action}'. Valid: {valid}")

        return handler(payload, cwd)

    # ----------------------------------------------------------------- actions

    def _status(self, payload: dict, cwd: str | None) -> ExecutionResult:
        return self._run_git(["git", "status", "--short"], cwd)

    def _diff(self, payload: dict, cwd: str | None) -> ExecutionResult:
        cmd = ["git", "diff"]
        if payload.get("staged"):
            cmd.append("--staged")
        return self._run_git(cmd, cwd)

    def _log(self, payload: dict, cwd: str | None) -> ExecutionResult:
        n = int(payload.get("n", 10))
        return self._run_git(["git", "log", f"--oneline", f"-{n}"], cwd)

    def _add(self, payload: dict, cwd: str | None) -> ExecutionResult:
        files = payload.get("files", [])
        if isinstance(files, str):
            files = [files]
        if not files:
            files = ["."]
        return self._run_git(["git", "add", "--"] + files, cwd)

    def _commit(self, payload: dict, cwd: str | None) -> ExecutionResult:
        message = str(payload.get("message", "chore: automated commit")).strip()
        if not message:
            return self._fail("commit requires a non-empty 'message'.")
        return self._run_git(["git", "commit", "-m", message], cwd)

    def _branch(self, payload: dict, cwd: str | None) -> ExecutionResult:
        return self._run_git(["git", "branch", "--show-current"], cwd)

    def _show(self, payload: dict, cwd: str | None) -> ExecutionResult:
        ref = str(payload.get("ref", "HEAD"))
        return self._run_git(["git", "show", "--stat", ref], cwd)

    # ----------------------------------------------------------------- helpers

    def _run_git(self, cmd: list[str], cwd: str | None) -> ExecutionResult:
        try:
            result = subprocess.run(
                cmd,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=GIT_TOOL_TIMEOUT,
            )
            output = (result.stdout or "").strip()
            stderr = (result.stderr or "").strip()
            combined = "\n".join(filter(None, [output, stderr]))

            if result.returncode == 0:
                return ExecutionResult(
                    tool_name=self.name,
                    success=True,
                    output=combined or "(no output)",
                )
            return self._fail(combined or f"git exited with code {result.returncode}")
        except subprocess.TimeoutExpired:
            return self._fail("git command timed out after 15s")
        except FileNotFoundError:
            return self._fail("git not found - is git installed and on PATH?")
        except Exception as exc:
            return self._fail(str(exc))

    def _fail(self, msg: str) -> ExecutionResult:
        return ExecutionResult(tool_name=self.name, success=False, output="", error=msg)
