from __future__ import annotations

"""
Validators - Orchestrator X

Pre-execution:  SyntaxValidator, ImportValidator
Post-execution: VerificationEngine (THINK->ACT->VERIFY)

VerificationEngine goes beyond exit-code checking to catch:
- Files that execute cleanly but produce wrong output
- Files that were written but contain subtle logical errors
- Commands that exited 0 but emitted error-pattern text
"""

import ast
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


class SyntaxValidator:
    """AST-based Python syntax checker - catches errors before execution."""

    @staticmethod
    def validate(file_path: str) -> tuple[bool, str]:
        """
        Returns (is_valid, diagnostic_message).
        diagnostic_message is empty string on success.
        """
        path = Path(file_path)
        if not path.exists():
            return False, f"File not found: {file_path}"
        if not path.is_file():
            return False, f"Not a file: {file_path}"

        try:
            source = path.read_text(encoding="utf-8")
        except OSError as e:
            return False, f"Cannot read {file_path}: {e}"

        try:
            ast.parse(source, filename=file_path)
            return True, ""
        except SyntaxError as e:
            lines = source.splitlines()
            bad_line = ""
            if e.lineno and 0 < e.lineno <= len(lines):
                bad_line = f"\n  > {lines[e.lineno - 1].rstrip()}"
            return False, (
                f"SyntaxError in {file_path} at line {e.lineno}: {e.msg}{bad_line}"
            )
        except Exception as e:
            return False, f"Parse error in {file_path}: {e}"


class ImportValidator:
    """
    Static import checker - flags missing standard-library or third-party modules
    that the code tries to import, so the planner can add an install step.
    """

    # Built-in modules that are always available
    _STDLIB_ALWAYS = frozenset({
        "ast", "os", "sys", "re", "json", "math", "time", "datetime",
        "pathlib", "subprocess", "collections", "itertools", "functools",
        "typing", "dataclasses", "abc", "io", "copy", "hashlib", "uuid",
        "random", "string", "enum", "inspect", "traceback", "logging",
        "threading", "multiprocessing", "socket", "http", "urllib",
        "base64", "struct", "csv", "tempfile", "shutil", "glob",
    })

    @classmethod
    def find_imports(cls, file_path: str) -> list[str]:
        """Return top-level module names imported by the script."""
        try:
            source = Path(file_path).read_text(encoding="utf-8")
            tree = ast.parse(source)
        except Exception:
            return []

        modules: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    modules.append(alias.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom) and node.module:
                modules.append(node.module.split(".")[0])
        return sorted(set(modules))

    @classmethod
    def find_third_party(cls, file_path: str) -> list[str]:
        """Return imports that are NOT in the stdlib always-set."""
        all_imports = cls.find_imports(file_path)
        return [m for m in all_imports if m not in cls._STDLIB_ALWAYS]


# ---------------------------------------------------------------------------
# VerificationEngine - post-execution outcome checking
# ---------------------------------------------------------------------------

_ERROR_PATTERNS = re.compile(
    r"traceback|error:|exception:|syntaxerror|nameerror|typeerror|"
    r"attributeerror|importerror|modulenotfounderror|zerodivisionerror|"
    r"valueerror|keyerror|indexerror|oserror|permissionerror|"
    r"runtimeerror|assertionerror|failed|fatal",
    re.IGNORECASE,
)

_SUCCESS_NEUTRAL = re.compile(r"no issues|0 failed|passed|ok\b|done\b", re.IGNORECASE)


@dataclass
class VerificationResult:
    passed: bool
    reason: str
    confidence: float  # 0.0 - 1.0


class VerificationEngine:
    """
    Post-execution verifier.

    Checks that a task's outcome actually meets the intent, going beyond
    just "exit code 0":
      - FileEngine write: file exists + is syntactically valid Python
      - SystemOperator: output doesn't contain error-pattern text;
        optionally matches an expected output pattern
      - DeployAgent: URL field is present in diagnostics
    """

    def verify(
        self,
        task: dict,
        result,                  # ExecutionResult
        expected_output: str = "",
    ) -> VerificationResult:
        tool = task.get("tool", "")

        if tool == "FileEngine":
            return self._verify_file_engine(task, result)
        if tool == "SystemOperator":
            return self._verify_system_operator(result, expected_output)
        if tool == "DeployAgent":
            return self._verify_deploy(result)
        if tool == "TestTool":
            return self._verify_test(result)
        # Generic: trust the exit code
        if result.success:
            return VerificationResult(passed=True, reason="exit code 0", confidence=0.7)
        return VerificationResult(passed=False, reason=result.error or "failed", confidence=1.0)

    # ---------------------------------------------------------------- file engine

    def _verify_file_engine(self, task: dict, result) -> VerificationResult:
        if not result.success:
            return VerificationResult(passed=False, reason=result.error or "write failed", confidence=1.0)

        payload = task.get("payload", {})
        action = payload.get("action", "")
        path_str = payload.get("path", "")

        if action == "write" and path_str:
            path = Path(path_str)
            if not path.exists():
                return VerificationResult(
                    passed=False, reason=f"File was not created: {path_str}", confidence=1.0
                )
            # Validate Python files
            if path.suffix == ".py":
                valid, err = SyntaxValidator.validate(path_str)
                if not valid:
                    return VerificationResult(
                        passed=False, reason=f"Written file has syntax error: {err}", confidence=1.0
                    )
            return VerificationResult(passed=True, reason="file written and valid", confidence=0.95)

        return VerificationResult(passed=True, reason="operation completed", confidence=0.8)

    # ---------------------------------------------------------------- system operator

    def _verify_system_operator(self, result, expected_output: str) -> VerificationResult:
        output = (result.output or "").strip()

        if not result.success:
            return VerificationResult(passed=False, reason=result.error or "command failed", confidence=1.0)

        # Check for error-pattern text even on exit-code-0 runs
        if _ERROR_PATTERNS.search(output):
            # But only fail if there's no success signal too
            if not _SUCCESS_NEUTRAL.search(output):
                return VerificationResult(
                    passed=False,
                    reason=f"Output contains error pattern: {output[:200]}",
                    confidence=0.75,
                )

        # If caller provided an expected pattern, check it
        if expected_output:
            if expected_output.lower() in output.lower():
                return VerificationResult(passed=True, reason="output matches expectation", confidence=0.98)
            return VerificationResult(
                passed=False,
                reason=f"Expected '{expected_output}' not found in output: {output[:200]}",
                confidence=0.9,
            )

        return VerificationResult(passed=True, reason="command succeeded", confidence=0.85)

    # ---------------------------------------------------------------- deploy

    def _verify_deploy(self, result) -> VerificationResult:
        if not result.success:
            return VerificationResult(passed=False, reason="deploy failed", confidence=1.0)

        diag = getattr(result, "diagnostics", {}) or {}
        url = diag.get("url", "")
        if not url:
            return VerificationResult(passed=False, reason="no URL returned by DeployAgent", confidence=0.8)

        # Actually hit the endpoint - remove human from the loop
        verified_url, status = self._http_probe(url)
        if status and 200 <= status < 400:
            return VerificationResult(
                passed=True,
                reason=f"HTTP {status} from {verified_url}",
                confidence=1.0,
            )
        if status:
            return VerificationResult(
                passed=False,
                reason=f"HTTP {status} from {verified_url} - server running but unhealthy",
                confidence=0.9,
            )
        return VerificationResult(
            passed=False,
            reason=f"No response from {url} - server may not have started",
            confidence=0.85,
        )

    @staticmethod
    def _http_probe(
        base_url: str, timeout: float = 5.0, retries: int = 3, retry_delay: float = 2.0
    ) -> tuple[str, int | None]:
        """
        Probe base_url then common health paths, with retries.
        Waits before first attempt - uvicorn binds TCP before HTTP is ready.
        Returns (probed_url, status_code) or (base_url, None) on failure.
        """
        import time
        from urllib.request import urlopen, Request
        from urllib.error import URLError

        probes = ["", "/health", "/healthz", "/status", "/ping", "/docs"]

        for attempt in range(retries):
            if attempt > 0:
                time.sleep(retry_delay)
            else:
                time.sleep(1.5)  # brief startup grace period

            for path in probes:
                url = base_url.rstrip("/") + path
                try:
                    req = Request(url, headers={"User-Agent": "OrchestratorX-Verifier/1.0"})
                    with urlopen(req, timeout=timeout) as resp:
                        return url, resp.status
                except URLError:
                    continue
                except Exception:
                    continue

        return base_url, None

    # ---------------------------------------------------------------- test tool

    def _verify_test(self, result) -> VerificationResult:
        if result.success:
            return VerificationResult(passed=True, reason="all tests passed", confidence=1.0)
        return VerificationResult(
            passed=False,
            reason=f"tests failed: {(result.output or '')[:300]}",
            confidence=1.0,
        )


# ---------------------------------------------------------------------------
# Quick helper used by core.py
# ---------------------------------------------------------------------------

_verifier = VerificationEngine()


def verify_task(task: dict, result) -> VerificationResult:
    """Module-level convenience wrapper."""
    expected = task.get("expected_output", "")
    return _verifier.verify(task, result, expected_output=expected)
