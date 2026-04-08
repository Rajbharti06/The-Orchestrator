from __future__ import annotations

"""
DeployAgent – detects what kind of Python web app lives in a file,
launches it as a background process, waits for the port to open,
and returns the live URL.

Supported app types:
  • FastAPI  → uvicorn <module>:app
  • Flask    → flask --app <file> run
  • Streamlit → streamlit run <file>
  • Generic  → python <file>  (no URL check, just runs)

The launched process is tracked so it can be reported (PID + URL).
The caller is responsible for terminating the process when done.
"""

import importlib.util
import re
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from ..tool_registry import ExecutionResult


class DeployAgent:
    name = "DeployAgent"
    description = (
        "Deploys a Python web app (FastAPI / Flask / Streamlit) locally, "
        "waits for it to start, and returns the live URL."
    )

    # Registry of launched processes {pid: Popen}
    _processes: dict[int, Any] = {}

    def run(self, payload: dict) -> ExecutionResult:
        file_path = payload.get("file") or payload.get("path")
        # Always bind to 127.0.0.1 — 0.0.0.0 triggers WinError 10013 on Windows
        raw_host = payload.get("host", "127.0.0.1")
        host = "127.0.0.1" if raw_host in ("0.0.0.0", "::") else raw_host
        port = int(payload.get("port", 0)) or self._find_free_port()
        wait_secs = float(payload.get("wait_secs", 8))

        if not file_path:
            return ExecutionResult(
                self.name, False, "",
                "Missing 'file' in payload.",
            )

        path = Path(file_path)
        if not path.exists():
            return ExecutionResult(
                self.name, False, "",
                f"File not found: {file_path}",
            )

        app_type = self._detect_app_type(path)

        # If requested port is already in use, check if it's already serving our app
        if port and self._port_open(host, port):
            url = f"http://{host}:{port}"
            print(f"[DeployAgent] Port {port} already in use — reusing {url}")
            return ExecutionResult(
                self.name, True,
                f"App already running at {url}",
                diagnostics={"url": url, "app_type": app_type, "reused": True},
            )

        cmd = self._build_command(app_type, path, host, port)
        print(f"[DeployAgent] Launching {app_type.upper()} app: {cmd}")

        try:
            proc = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            self._processes[proc.pid] = proc

            # Generic scripts don't expose a port – just return success
            if app_type == "generic":
                time.sleep(1)
                if proc.poll() is not None:
                    out = self._read_proc_output(proc)
                    return ExecutionResult(
                        self.name, False, out,
                        f"Process exited immediately (code {proc.returncode}).",
                        diagnostics={"command": cmd, "app_type": app_type},
                    )
                return ExecutionResult(
                    self.name, True,
                    f"Process started (PID {proc.pid}). No URL – generic script.",
                    diagnostics={"pid": proc.pid, "app_type": app_type},
                )

            # Web apps: poll until port is open
            deadline = time.time() + wait_secs
            while time.time() < deadline:
                if proc.poll() is not None:
                    # Process died
                    out = self._read_proc_output(proc)
                    return ExecutionResult(
                        self.name, False, out,
                        f"{app_type.upper()} process exited early (code {proc.returncode}).",
                        diagnostics={"command": cmd, "app_type": app_type},
                    )
                if self._port_open(host, port):
                    url = f"http://{host}:{port}"
                    print(f"[DeployAgent] App live at {url}  (PID {proc.pid})")
                    return ExecutionResult(
                        self.name, True,
                        f"App running at {url}",
                        diagnostics={
                            "url": url,
                            "pid": proc.pid,
                            "app_type": app_type,
                            "command": cmd,
                        },
                    )
                time.sleep(0.5)

            # Timed out
            proc.terminate()
            out = self._read_proc_output(proc)
            return ExecutionResult(
                self.name, False, out,
                f"{app_type.upper()} server did not open port {port} within {wait_secs}s.",
                diagnostics={"command": cmd, "app_type": app_type, "port": port},
            )

        except Exception as e:
            return ExecutionResult(
                self.name, False, "",
                f"DeployAgent exception: {e}",
                diagnostics={"command": cmd},
            )

    # ---------------------------------------------------------------- detect

    @staticmethod
    def _detect_app_type(path: Path) -> str:
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return "generic"

        content_lower = content.lower()

        if "fastapi" in content_lower or re.search(r"FastAPI\(", content):
            return "fastapi"
        if "flask" in content_lower and re.search(r"Flask\(", content):
            return "flask"
        if "import streamlit" in content_lower or "from streamlit" in content_lower:
            return "streamlit"
        return "generic"

    @staticmethod
    def _build_command(app_type: str, path: Path, host: str, port: int) -> str:
        module = path.stem  # filename without extension
        abs_path = str(path.resolve())
        py = sys.executable

        if app_type == "fastapi":
            # Try to detect the app variable name
            try:
                source = path.read_text(encoding="utf-8")
                m = re.search(r"(\w+)\s*=\s*FastAPI\(", source)
                app_var = m.group(1) if m else "app"
            except Exception:
                app_var = "app"
            # Run from the file's directory so relative imports work
            cwd = str(path.parent)
            return (
                f"cd /d {cwd} && "
                f"{py} -m uvicorn {module}:{app_var} "
                f"--host {host} --port {port}"
            )

        if app_type == "flask":
            return (
                f"{py} -m flask --app {abs_path} run "
                f"--host {host} --port {port}"
            )

        if app_type == "streamlit":
            return (
                f"{py} -m streamlit run {abs_path} "
                f"--server.port {port} "
                f"--server.address {host} "
                f"--server.headless true"
            )

        return f"{py} {abs_path}"

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _find_free_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("", 0))
            return s.getsockname()[1]

    @staticmethod
    def _port_open(host: str, port: int) -> bool:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            return False

    @staticmethod
    def _read_proc_output(proc: Any, max_chars: int = 1000) -> str:
        try:
            if proc.stdout:
                return proc.stdout.read(max_chars)
        except Exception:
            pass
        return ""

    @classmethod
    def terminate(cls, pid: int) -> bool:
        """Stop a previously-launched process by PID."""
        proc = cls._processes.pop(pid, None)
        if proc:
            try:
                proc.terminate()
                return True
            except Exception:
                pass
        return False
