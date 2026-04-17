from __future__ import annotations

from typing import Dict, Any, Protocol
from dataclasses import dataclass

@dataclass(frozen=True)
class ExecutionResult:
    tool_name: str
    success: bool
    output: str
    error: str | None = None
    diagnostics: dict | None = None

class Tool(Protocol):
    name: str
    description: str
    def run(self, payload: Any) -> ExecutionResult:
        ...

class ToolRegistry:
    """The nervous system of Orchestrator v2 - manages and routes to execution units."""
    
    def __init__(self):
        self._tools: Dict[str, Tool] = {}

    def register(self, tool: Tool):
        print(f"Registered tool: {tool.name}")
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def execute(self, name: str, payload: Any) -> ExecutionResult:
        tool = self.get_tool(name)
        if not tool:
            return ExecutionResult(
                tool_name=name,
                success=False,
                output="",
                error=f"Tool '{name}' not found in registry."
            )
        
        try:
            return tool.run(payload)
        except Exception as e:
            return ExecutionResult(
                tool_name=name,
                success=False,
                output="",
                error=str(e)
            )

    def list_tools(self) -> list[Dict[str, str]]:
        return [{"name": t.name, "description": t.description} for t in self._tools.values()]
