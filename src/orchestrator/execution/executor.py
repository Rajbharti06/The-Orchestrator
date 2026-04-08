from __future__ import annotations

from typing import Any
from .tool_registry import ToolRegistry, ExecutionResult

class RuntimeExecutor:
    """The action engine of Orchestrator v2 - turns plans into reality."""
    
    def __init__(self, registry: ToolRegistry):
        self.registry = registry

    def perform(self, tool_name: str, payload: Any) -> ExecutionResult:
        """Executes a tool and returns the result."""
        print(f"Performing: {tool_name} with {str(payload)[:50]}...")
        result = self.registry.execute(tool_name, payload)
        
        if result.success:
            print(f"Success: {tool_name}")
        else:
            print(f"Failed: {tool_name} - {result.error}")
            
        return result

    def sequence(self, tasks: list[dict[str, Any]]) -> list[ExecutionResult]:
        """Executes a series of tasks sequentially."""
        results = []
        for task in tasks:
            res = self.perform(task["tool"], task["payload"])
            results.append(res)
            if not res.success:
                print(f"Stopping sequence due to failure in {task['tool']}")
                break
        return results
