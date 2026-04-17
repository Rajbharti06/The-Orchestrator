from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Any
from ..tool_registry import ExecutionResult

class FileEngine:
    """Orchestrator v2's primary unit for file system interactions."""
    
    name = "FileEngine"
    description = "Handles reading, writing, and editing files in the workspace."

    def run(self, payload: Dict[str, Any]) -> ExecutionResult:
        action = payload.get("action")
        file_path = payload.get("path")
        
        if not action or not file_path:
            return ExecutionResult(self.name, False, "", "Missing 'action' or 'path' in payload.")

        try:
            path = Path(file_path).resolve()
            
            if action == "write":
                content = payload.get("content", "")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding='utf-8')
                return ExecutionResult(self.name, True, f"Successfully wrote to {file_path}")
                
            elif action == "read":
                if not path.exists():
                    return ExecutionResult(self.name, False, "", f"File not found: {file_path}")
                return ExecutionResult(self.name, True, path.read_text(encoding='utf-8'))
                
            elif action == "edit":
                old_str = payload.get("old_str")
                new_str = payload.get("new_str")
                if old_str is None or new_str is None:
                    return ExecutionResult(self.name, False, "", "Edit action requires 'old_str' and 'new_str'.")
                
                content = path.read_text(encoding='utf-8')
                if old_str not in content:
                    return ExecutionResult(self.name, False, "", f"Search string not found in {file_path}")
                
                new_content = content.replace(old_str, new_str, 1)
                path.write_text(new_content, encoding='utf-8')
                return ExecutionResult(self.name, True, f"Successfully edited {file_path}")
                
            else:
                return ExecutionResult(self.name, False, "", f"Unknown action: {action}")
                
        except Exception as e:
            return ExecutionResult(self.name, False, "", str(e))
