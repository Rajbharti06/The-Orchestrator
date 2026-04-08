from __future__ import annotations

import subprocess
import os
from typing import Dict, Any
from ..tool_registry import ExecutionResult
from ...config import SYSTEM_OPERATOR_TIMEOUT

class SystemOperator:
    """Orchestrator v2's primary unit for system-level execution."""
    
    name = "SystemOperator"
    description = "Executes shell commands and manages the runtime environment."

    @staticmethod
    def _sanitize_command(command: str) -> str:
        """Fix common environment issues before executing."""
        import re
        # CLI form: --host 0.0.0.0 → --host 127.0.0.1
        command = re.sub(r'--host\s+0\.0\.0\.0', '--host 127.0.0.1', command)
        # Python form: host="0.0.0.0" or host='0.0.0.0' inside uvicorn.run()/run()
        command = re.sub(r"""host\s*=\s*['"]0\.0\.0\.0['"]""", 'host="127.0.0.1"', command)
        # Strip --reload from uvicorn CLI (double-bind conflict on Windows)
        if 'uvicorn' in command:
            command = re.sub(r'\s+--reload\b', '', command)
        return command

    def run(self, payload: Dict[str, Any]) -> ExecutionResult:
        command = payload.get("command")
        cwd = payload.get("cwd", os.getcwd())

        if not command:
            return ExecutionResult(self.name, False, "", "Missing 'command' in payload.")

        command = self._sanitize_command(command)

        try:
            # For this demo, we use shell=True for a more realistic "bash" experience on Windows (PowerShell)
            # In a real tool, we'd want more security, but this is for a demo.
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=SYSTEM_OPERATOR_TIMEOUT,
                cwd=cwd
            )
            
            output = result.stdout
            if result.stderr:
                output += f"\nError Output:\n{result.stderr}"
            
            if result.returncode == 0:
                return ExecutionResult(self.name, True, output if output.strip() else "(no output)")
            else:
                return ExecutionResult(self.name, False, output, f"Command failed with exit code {result.returncode}")
                
        except Exception as e:
            return ExecutionResult(self.name, False, "", str(e))
